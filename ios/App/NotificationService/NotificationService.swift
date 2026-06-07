//
//  NotificationService.swift
//  NotificationService
//
//  Notification Service Extension — renders album art (or any image) in a
//  push notification. The backend (server/push.ts) sends APNs alerts with
//  `aps.mutable-content = 1` and the absolute, publicly-fetchable artwork URL
//  at the payload top level under the `image` key. iOS wakes this extension
//  for any mutable alert; we download that image and attach it so it shows in
//  the expanded notification.
//
//  Fallback is graceful at every step: no `image` key, a non-image URL, a
//  download failure, or the ~30s extension budget running out all fall back
//  to delivering the plain title/body the server already populated.
//

import UserNotifications

class NotificationService: UNNotificationServiceExtension {

    var contentHandler: ((UNNotificationContent) -> Void)?
    var bestAttemptContent: UNMutableNotificationContent?
    var downloadTask: URLSessionDataTask?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        self.bestAttemptContent = request.content.mutableCopy() as? UNMutableNotificationContent

        guard let bestAttemptContent = bestAttemptContent else {
            contentHandler(request.content)
            return
        }

        // The server rides the absolute artwork URL at the payload top level
        // under `image`. Anything missing / malformed → plain text alert.
        guard
            let imageURLString = bestAttemptContent.userInfo["image"] as? String,
            let imageURL = URL(string: imageURLString),
            imageURL.scheme?.lowercased() == "https" || imageURL.scheme?.lowercased() == "http"
        else {
            contentHandler(bestAttemptContent)
            return
        }

        downloadTask = URLSession.shared.dataTask(with: imageURL) { [weak self] data, response, _ in
            guard let self = self else { return }
            defer {
                // Whatever happened, deliver SOMETHING. If the attachment was
                // added it rides along; otherwise this is the plain alert.
                contentHandler(self.bestAttemptContent ?? bestAttemptContent)
            }

            guard let data = data else { return }

            // Pick a file extension from the response MIME type so the OS
            // recognizes the attachment; default to .jpg.
            let ext: String
            switch (response?.mimeType ?? "").lowercased() {
            case "image/png": ext = "png"
            case "image/gif": ext = "gif"
            case "image/webp": ext = "webp"
            default: ext = "jpg"
            }

            let tmpURL = URL(fileURLWithPath: NSTemporaryDirectory())
                .appendingPathComponent(ProcessInfo.processInfo.globallyUniqueString)
                .appendingPathExtension(ext)

            do {
                try data.write(to: tmpURL)
                let attachment = try UNNotificationAttachment(identifier: "albumArt", url: tmpURL, options: nil)
                self.bestAttemptContent?.attachments = [attachment]
            } catch {
                // Leave the plain alert; the defer above still delivers it.
            }
        }
        downloadTask?.resume()
    }

    override func serviceExtensionTimeWillExpire() {
        // The system is about to kill the extension (~30s budget). Cancel the
        // in-flight download and deliver the best content we have so far —
        // worst case the plain title/body the server populated.
        downloadTask?.cancel()
        if let contentHandler = contentHandler, let bestAttemptContent = bestAttemptContent {
            contentHandler(bestAttemptContent)
        }
    }
}
