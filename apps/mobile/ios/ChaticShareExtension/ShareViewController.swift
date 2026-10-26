import os
import UIKit

/// Dou in other apps' share sheets. The extension receives and nothing more: it copies what was shared
/// into the App Group inbox the app reads (`<group>/ShareIntake/<app bundle id>/<id>/`), writes the
/// share's `manifest.json` last, and opens the app on `<scheme>://share?id=<id>`. The app's
/// `ShareIntake` module moves each copy into an `attach-pick` folder of its own when the share page asks.
///
/// No destination list and no network here: the session, the rooms and the sockets live in the app's
/// WebView. When the app cannot be opened from here, the sheet says so and the inbox entry is swept
/// by the app a day later.
@objc(ShareViewController)
final class ShareViewController: UIViewController {
    private typealias Core = ShareIntakeCore

    /// Steps only, never what was shared.
    private static let log = Logger(subsystem: Bundle.main.bundleIdentifier ?? "ChaticShareExtension", category: "share")

    /// Why the sheet stays open instead of handing the share to the app.
    private enum Failure: String {
        /// The share is in the inbox, but the app could not be opened on it.
        case cannotOpen = "share.cannotOpen"
        /// The share could not be written where the app reads it.
        case cannotSave = "share.cannotSave"
        /// Nothing the other app handed over is something Dou can send.
        case nothing = "share.nothing"
    }

    private let spinner = UIActivityIndicatorView(style: .large)
    private let message = UILabel()
    private let done = UIButton(type: .system)
    private var started = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        spinner.startAnimating()
        message.numberOfLines = 0
        message.textAlignment = .center
        message.isHidden = true
        done.setTitle(NSLocalizedString("share.done", comment: "Closes the share sheet"), for: .normal)
        done.isHidden = true
        done.addTarget(self, action: #selector(finish), for: .touchUpInside)

        let stack = UIStackView(arrangedSubviews: [spinner, message, done])
        stack.axis = .vertical
        stack.spacing = 16
        stack.alignment = .center
        stack.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stack.leadingAnchor.constraint(equalTo: view.layoutMarginsGuide.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: view.layoutMarginsGuide.trailingAnchor),
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        guard !started else { return }
        started = true
        Task { await receive() }
    }

    // MARK: - Receive

    private func receive() async {
        guard let host = Bundle.main.object(forInfoDictionaryKey: "HostBundleIdentifier") as? String,
              let scheme = Bundle.main.object(forInfoDictionaryKey: "HostURLScheme") as? String,
              let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Core.appGroup)
        else {
            Self.log.error("no host bundle id, scheme or App Group container")
            return show(.cannotSave)
        }

        let id = UUID().uuidString.lowercased()
        let folder = container
            .appendingPathComponent("ShareIntake", isDirectory: true)
            .appendingPathComponent(host, isDirectory: true)
            .appendingPathComponent(id, isDirectory: true)
        var manifest = Core.Manifest()
        var texts: [String] = []

        let inputItems = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        let providers = inputItems.flatMap { $0.attachments ?? [] }
        for provider in providers {
            switch Core.content(of: provider.registeredTypeIdentifiers) {
            case let .text(type):
                if let text = await SharedItems.loadText(provider, type: type) {
                    texts.append(text)
                } else {
                    // Offered as text but not readable as one: named as not sent rather than dropped.
                    manifest.refused.append(.init(name: provider.suggestedName ?? "text", kind: Core.ItemKind.file.rawValue, reason: "unreadable"))
                }
            case let .file(kind, types):
                let fallback = provider.suggestedName ?? kind.rawValue
                if manifest.items.count >= Core.itemMax {
                    manifest.refused.append(.init(name: fallback, kind: kind.rawValue, reason: "unsupported"))
                    continue
                }
                let slot = folder.appendingPathComponent(String(manifest.items.count), isDirectory: true)
                if let item = await SharedItems.copy(provider, types: types, into: slot) {
                    manifest.items.append(item)
                } else {
                    manifest.refused.append(.init(name: fallback, kind: kind.rawValue, reason: "unreadable"))
                }
            case .none:
                manifest.refused.append(.init(name: provider.suggestedName ?? "file", kind: Core.ItemKind.file.rawValue, reason: "unsupported"))
            }
        }
        if texts.isEmpty {
            // Some apps put a post or a note on the item itself, with no text attachment. Only then:
            // beside a shared link it is usually the page's title, which the link already says.
            texts = inputItems.compactMap { Core.itemText($0.attributedContentText) }
        }
        manifest.text = texts.isEmpty ? nil : texts.joined(separator: "\n")

        guard !manifest.items.isEmpty || !manifest.refused.isEmpty || manifest.text != nil else {
            Self.log.info("nothing to share in \(inputItems.count) items")
            return show(.nothing)
        }
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            // Written last: the app reads a share only once its manifest exists.
            try JSONEncoder().encode(manifest).write(to: folder.appendingPathComponent(Core.manifestFileName), options: .atomic)
        } catch {
            Self.log.error("writing the share failed: \(error.localizedDescription, privacy: .public)")
            try? FileManager.default.removeItem(at: folder)
            return show(.cannotSave)
        }

        guard let url = URL(string: "\(scheme)://share?id=\(id)") else { return show(.cannotOpen) }
        openHost(url) { [weak self] opened in
            DispatchQueue.main.async {
                if opened { self?.finish() } else {
                    Self.log.error("the app could not be opened on the share")
                    self?.show(.cannotOpen)
                }
            }
        }
    }

    // MARK: - Open the app

    /// An extension may not call `UIApplication.open`; the application object is reached through the
    /// responder chain instead and asked by selector. `completion(false)` when there is none.
    private func openHost(_ url: URL, completion: @escaping (Bool) -> Void) {
        typealias Open = @convention(c) (AnyObject, Selector, NSURL, NSDictionary, (@convention(block) (Bool) -> Void)?) -> Void
        let selector = NSSelectorFromString("openURL:options:completionHandler:")
        var responder: UIResponder? = self
        while let current = responder {
            if current is UIApplication, current.responds(to: selector), let method = current.method(for: selector) {
                let open = unsafeBitCast(method, to: Open.self)
                open(current, selector, url as NSURL, NSDictionary(), { opened in completion(opened) })
                return
            }
            responder = current.next
        }
        completion(false)
    }

    // MARK: - Finish

    private func show(_ failure: Failure) {
        DispatchQueue.main.async {
            self.message.text = NSLocalizedString(failure.rawValue, comment: "Why the share sheet did not hand the share to the app")
            self.spinner.stopAnimating()
            self.message.isHidden = false
            self.done.isHidden = false
        }
    }

    @objc private func finish() {
        extensionContext?.completeRequest(returningItems: nil)
    }
}

/// Reading what the other app shared, away from the screen: each provider's callback runs on a queue of
/// its own. What an item is taken as and the name it is kept under are `ShareIntakeCore`'s.
private enum SharedItems {
    static func loadText(_ provider: NSItemProvider, type: String) async -> String? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type, options: nil) { item, _ in
                continuation.resume(returning: ShareIntakeCore.sharedText(item))
            }
        }
    }

    /// Copies the first of `types` the provider hands over into `slot`. The file a provider hands over
    /// is deleted as soon as its callback returns, so the copy is made inside it.
    static func copy(_ provider: NSItemProvider, types: [String], into slot: URL) async -> ShareIntakeCore.Manifest.Item? {
        let suggested = provider.suggestedName
        for type in types {
            let item: ShareIntakeCore.Manifest.Item? = await withCheckedContinuation { continuation in
                provider.loadFileRepresentation(forTypeIdentifier: type) { url, _ in
                    guard let url else { return continuation.resume(returning: nil) }
                    let name = ShareIntakeCore.fileName(suggested: suggested, loadedName: url.lastPathComponent, type: type)
                    let target = slot.appendingPathComponent(name)
                    do {
                        try FileManager.default.createDirectory(at: slot, withIntermediateDirectories: true)
                        try FileManager.default.copyItem(at: url, to: target)
                        continuation.resume(returning: .init(path: "\(slot.lastPathComponent)/\(name)", name: name, type: type))
                    } catch {
                        try? FileManager.default.removeItem(at: slot)
                        continuation.resume(returning: nil)
                    }
                }
            }
            if let item { return item }
        }
        return nil
    }
}
