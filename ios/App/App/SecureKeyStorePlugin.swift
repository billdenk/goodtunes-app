import Foundation
import Capacitor
import Security
import UIKit

/**
 * SecureKeyStore — hardware-backed per-device key store + jailbreak probe.
 *
 * This is the Tier-3 hardening for offline downloads (see docs/roadmap.md).
 * The per-device master key that encrypts downloaded audio lives in the iOS
 * Keychain instead of the WebKit-sandboxed IndexedDB used before. The key is
 * stored with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, so it:
 *   - never syncs to iCloud or migrates to another device (ThisDeviceOnly),
 *   - is unreadable until the device has been unlocked once after boot, and
 *   - is encrypted at rest by the Secure Enclave-derived class keys.
 *
 *   - `getKey()` → returns the 256-bit key as base64, generating + storing a
 *                  random one on first call (idempotent thereafter).
 *   - `isDeviceCompromised()` → best-effort jailbreak detection.
 *
 * The JS side imports the returned bytes as a NON-extractable WebCrypto key
 * for AES-GCM (see `client/src/lib/nativeDownloads.ts`), and zeroes the
 * transient buffer. The matching JS wrapper is
 * `client/src/lib/nativeSecureKey.ts`.
 *
 * Mirrors the in-tree plugin pattern established by SystemVolumePlugin.swift;
 * registered in the Xcode target by hand (project.pbxproj).
 */
@objc(SecureKeyStorePlugin)
public class SecureKeyStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureKeyStorePlugin"
    public let jsName = "SecureKeyStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getKey", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isDeviceCompromised", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pinnedDownload", returnType: CAPPluginReturnPromise)
    ]

    /// Keychain account/service identifying the offline-download master key.
    private let service = "music.goodtunes.offline"
    private let account = "offline-master-key"
    private let keyByteCount = 32 // AES-256

    @objc func getKey(_ call: CAPPluginCall) {
        if let existing = loadKey() {
            call.resolve(["value": existing.base64EncodedString()])
            return
        }
        guard let fresh = randomKey() else {
            call.reject("failed to generate secure key")
            return
        }
        guard storeKey(fresh) else {
            call.reject("failed to persist secure key")
            return
        }
        call.resolve(["value": fresh.base64EncodedString()])
    }

    @objc func isDeviceCompromised(_ call: CAPPluginCall) {
        call.resolve(["value": Self.isJailbroken()])
    }

    // MARK: - TLS-pinned download

    /**
     * Fetch a URL over the app's URLSession and return the raw bytes as base64.
     *
     * The whole point of routing the offline-download fetch through here instead
     * of a WebView `fetch()` is TLS pinning: NSPinnedDomains in Info.plist pins
     * GoodTunes' own hosts to the long-lived ISRG (Let's Encrypt) roots, and
     * URLSession — unlike WKWebView — ENFORCES those pins. A man-in-the-middle on
     * a GoodTunes host therefore can't swap the download bytes. Hosts that aren't
     * in NSPinnedDomains (legacy Dropbox masters, Mux, Stripe) just get normal
     * validation, so this never bricks them.
     *
     * On a pin mismatch the request fails and we `reject` — the JS layer must NOT
     * silently fall back to the unpinned WebView fetch on failure, only when this
     * method is entirely absent (older build).
     */
    @objc func pinnedDownload(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("invalid url")
            return
        }
        var request = URLRequest(url: url)
        request.setValue("GoodTunes-Native", forHTTPHeaderField: "User-Agent")
        request.timeoutInterval = 120
        // URLSession.shared honors the app's ATS NSPinnedDomains automatically.
        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                // Includes the pinning failure (NSURLErrorServerCertificateUntrusted).
                call.reject("pinned download failed: \(error.localizedDescription)")
                return
            }
            guard let http = response as? HTTPURLResponse else {
                call.reject("pinned download failed: no response")
                return
            }
            guard (200..<300).contains(http.statusCode) else {
                call.reject("pinned download failed: HTTP \(http.statusCode)")
                return
            }
            guard let data = data else {
                call.reject("pinned download failed: empty body")
                return
            }
            call.resolve(["value": data.base64EncodedString()])
        }
        task.resume()
    }

    // MARK: - Keychain

    private func randomKey() -> Data? {
        var bytes = [UInt8](repeating: 0, count: keyByteCount)
        let status = SecRandomCopyBytes(kSecRandomDefault, keyByteCount, &bytes)
        return status == errSecSuccess ? Data(bytes) : nil
    }

    private func loadKey() -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data, data.count == keyByteCount else {
            return nil
        }
        return data
    }

    private func storeKey(_ key: Data) -> Bool {
        // Delete any stale item first so a re-add can't fail with errSecDuplicateItem.
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(base as CFDictionary)

        var add = base
        add[kSecValueData as String] = key
        // Device-bound, available after first unlock — survives backgrounded
        // playback but never leaves this device or syncs to iCloud.
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        return status == errSecSuccess
    }

    // MARK: - Jailbreak detection (best-effort)

    private static func isJailbroken() -> Bool {
        #if targetEnvironment(simulator)
        return false
        #else
        let suspectPaths = [
            "/Applications/Cydia.app",
            "/Applications/Sileo.app",
            "/Library/MobileSubstrate/MobileSubstrate.dylib",
            "/usr/sbin/sshd",
            "/usr/bin/ssh",
            "/bin/bash",
            "/etc/apt",
            "/private/var/lib/apt/"
        ]
        for path in suspectPaths where FileManager.default.fileExists(atPath: path) {
            return true
        }

        // Can we write outside the app sandbox? Only possible if jailbroken.
        let probe = "/private/jailbreak_probe_\(UUID().uuidString).txt"
        do {
            try "probe".write(toFile: probe, atomically: true, encoding: .utf8)
            try? FileManager.default.removeItem(atPath: probe)
            return true
        } catch {
            // Expected on a stock device — write is denied.
        }

        // cydia: URL scheme is registered by common jailbreak tooling.
        if let url = URL(string: "cydia://package/com.example.package"),
           UIApplication.shared.canOpenURL(url) {
            return true
        }
        return false
        #endif
    }
}
