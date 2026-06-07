package fm.goodtunes.player;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.KeyStore;
import java.security.SecureRandom;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * SecureKeyStore — hardware-backed per-device key store + root probe.
 *
 * Tier-3 hardening for offline downloads (see docs/roadmap.md). The per-device
 * master key that encrypts downloaded audio is sealed by a hardware-backed
 * AndroidKeyStore AES key (TEE / StrongBox where the device supports it) and
 * persisted only as ciphertext in private SharedPreferences. The raw 256-bit
 * data key is generated once, wrapped by the Keystore key, and can only be
 * unwrapped on this device by this app — so a copied download file is useless
 * elsewhere even if the prefs file is lifted.
 *
 *   - getKey()             → base64 of the 256-bit data key (generated + sealed
 *                            on first call, idempotent thereafter).
 *   - isDeviceCompromised()→ best-effort root detection.
 *
 * The JS side imports the returned bytes as a NON-extractable WebCrypto key
 * for AES-GCM (client/src/lib/nativeDownloads.ts) and zeroes the buffer. The
 * matching JS wrapper is client/src/lib/nativeSecureKey.ts. Registered in
 * MainActivity.onCreate via registerPlugin(...).
 */
@CapacitorPlugin(name = "SecureKeyStore")
public class SecureKeyStorePlugin extends Plugin {

    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String WRAP_KEY_ALIAS = "gt_offline_master_wrap";
    private static final String PREFS = "gt_secure";
    private static final String PREF_CIPHERTEXT = "offline_master_ct";
    private static final String PREF_IV = "offline_master_iv";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int KEY_BYTES = 32; // AES-256
    private static final int GCM_TAG_BITS = 128;

    @PluginMethod
    public void getKey(PluginCall call) {
        try {
            byte[] key = loadKey();
            if (key == null) {
                key = new byte[KEY_BYTES];
                new SecureRandom().nextBytes(key);
                storeKey(key);
            }
            JSObject ret = new JSObject();
            ret.put("value", Base64.encodeToString(key, Base64.NO_WRAP));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("failed to access secure key store", e);
        }
    }

    /**
     * Fetch a URL over the platform HTTP stack and return the raw bytes as base64.
     *
     * Routing the offline-download fetch through here instead of a WebView
     * {@code fetch()} is what makes TLS pinning actually apply: the Network
     * Security Config (res/xml/network_security_config.xml) pins GoodTunes' own
     * hosts to the long-lived ISRG (Let's Encrypt) roots, and HttpsURLConnection —
     * unlike WebView — ENFORCES that pin-set. A man-in-the-middle on a GoodTunes
     * host therefore can't swap the download bytes. Hosts not covered by the
     * pin-set (legacy Dropbox masters, Mux, Stripe) just get normal validation,
     * so this never bricks them.
     *
     * On a pin mismatch the handshake throws and we reject — the JS layer must NOT
     * silently fall back to the unpinned WebView fetch on failure, only when this
     * method is entirely absent (older build).
     */
    @PluginMethod
    public void pinnedDownload(PluginCall call) {
        final String urlStr = call.getString("url");
        if (urlStr == null || urlStr.isEmpty()) {
            call.reject("invalid url");
            return;
        }
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(urlStr);
                conn = (HttpURLConnection) url.openConnection();
                conn.setConnectTimeout(30000);
                conn.setReadTimeout(120000);
                conn.setInstanceFollowRedirects(true);
                conn.setRequestProperty("User-Agent", "GoodTunes-Native");
                int code = conn.getResponseCode();
                if (code < 200 || code >= 300) {
                    call.reject("pinned download failed: HTTP " + code);
                    return;
                }
                InputStream in = conn.getInputStream();
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[16384];
                int n;
                while ((n = in.read(buf)) != -1) {
                    bos.write(buf, 0, n);
                }
                in.close();
                JSObject ret = new JSObject();
                ret.put("value", Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP));
                call.resolve(ret);
            } catch (Exception e) {
                // Includes SSLPeerUnverifiedException on a pin mismatch.
                call.reject("pinned download failed", e);
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }).start();
    }

    @PluginMethod
    public void isDeviceCompromised(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("value", isRooted());
        call.resolve(ret);
    }

    // ── Keystore-sealed data key ──────────────────────────────────────────

    private SharedPreferences prefs() {
        Context ctx = getContext();
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey getOrCreateWrapKey() throws Exception {
        KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
        ks.load(null);
        if (ks.containsAlias(WRAP_KEY_ALIAS)) {
            return (SecretKey) ks.getKey(WRAP_KEY_ALIAS, null);
        }
        // Prefer the dedicated secure element (StrongBox) when present, but it's
        // optional hardware: on devices without it, generation itself throws
        // (StrongBoxUnavailableException / provider error), NOT the builder
        // setter — so we must catch around generateKey() and retry on the
        // TEE-backed Keystore path. Without this retry, hardware backing would
        // silently fail on every non-StrongBox device and fall back to the
        // software key.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                return generateWrapKey(true);
            } catch (Exception strongBoxUnavailable) {
                // Fall through to the standard TEE-backed Keystore key.
            }
        }
        return generateWrapKey(false);
    }

    private SecretKey generateWrapKey(boolean strongBox) throws Exception {
        KeyGenerator gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        KeyGenParameterSpec.Builder spec = new KeyGenParameterSpec.Builder(
                WRAP_KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256);
        if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            spec.setIsStrongBoxBacked(true);
        }
        gen.init(spec.build());
        return gen.generateKey();
    }

    private byte[] loadKey() throws Exception {
        SharedPreferences p = prefs();
        String ctB64 = p.getString(PREF_CIPHERTEXT, null);
        String ivB64 = p.getString(PREF_IV, null);
        if (ctB64 == null || ivB64 == null) return null;
        byte[] ct = Base64.decode(ctB64, Base64.NO_WRAP);
        byte[] iv = Base64.decode(ivB64, Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateWrapKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
        byte[] key = cipher.doFinal(ct);
        return key.length == KEY_BYTES ? key : null;
    }

    private void storeKey(byte[] key) throws Exception {
        Cipher cipher = Cipher.getInstance(TRANSFORMATION);
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateWrapKey());
        byte[] iv = cipher.getIV();
        byte[] ct = cipher.doFinal(key);
        prefs().edit()
                .putString(PREF_CIPHERTEXT, Base64.encodeToString(ct, Base64.NO_WRAP))
                .putString(PREF_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
                .apply();
    }

    // ── Root detection (best-effort) ──────────────────────────────────────

    private boolean isRooted() {
        String tags = Build.TAGS;
        if (tags != null && tags.contains("test-keys")) return true;

        String[] suBinaries = {
                "/system/bin/su",
                "/system/xbin/su",
                "/sbin/su",
                "/system/app/Superuser.apk",
                "/system/app/SuperSU",
                "/data/local/bin/su",
                "/data/local/xbin/su",
                "/su/bin/su",
                "/system/bin/.ext/.su",
                "/system/xbin/daemonsu"
        };
        for (String path : suBinaries) {
            try {
                if (new File(path).exists()) return true;
            } catch (Exception ignored) {
                // Permission denied probing — treat as inconclusive.
            }
        }

        // Common root-management packages.
        String[] rootPackages = {
                "com.topjohnwu.magisk",
                "eu.chainfire.supersu",
                "com.koushikdutta.superuser",
                "com.noshufou.android.su"
        };
        for (String pkg : rootPackages) {
            try {
                getContext().getPackageManager().getPackageInfo(pkg, 0);
                return true;
            } catch (Exception ignored) {
                // Not installed — expected on a stock device.
            }
        }
        return false;
    }
}
