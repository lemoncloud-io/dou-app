import Foundation
import UIKit
import UserNotifications

/// Process-wide owner of every file transfer: the registry (`TransferCore`), the one background
/// `URLSession`, and its delegate.
///
/// It is deliberately independent of React Native. iOS relaunches the app in the background to
/// deliver a finished upload, often before (or without) React Native starting; if the RN module
/// owned the session, that result would have nowhere to land. The RN module only forwards calls
/// here and relays events while it has listeners.
///
/// Everything mutable is touched on `queue` only. The session delivers its delegate callbacks on
/// that same queue, so the core is always driven from one serial context.
final class TransferSessionOwner: NSObject {
    static let shared = TransferSessionOwner()

    /// One fixed identifier for the life of the install, so a relaunched process reattaches to
    /// the transfers the previous one left running.
    static let sessionIdentifier = "\(Bundle.main.bundleIdentifier!).transfer"
    static let progressTaskIdentifier = "\(Bundle.main.bundleIdentifier!).transfer.progress"

    /// How long a transfer runs before the system progress UI is asked for. The UI arrives with a
    /// haptic and a banner, and a chat photo is usually uploaded well inside this — so a quick send
    /// stays quiet, and only a transfer long enough to be worth watching gets the UI.
    private static let progressTaskDelay: DispatchTimeInterval = .seconds(3)

    /// Enough for an S3 error document; the body is only read for its `<Code>`.
    private static let maxResponseBodyBytes = 4 * 1024
    private static let logTag = "TRANSFER"

    let queue = DispatchQueue(label: "io.chatic.dou.transfer.owner")

    private var core: TransferCore!
    private var session: URLSession!
    private var tasksById: [String: URLSessionTask] = [:]
    /// Tasks this process has already accounted for, so a late callback for a transfer that ended
    /// and was acknowledged is not mistaken for one left over from a previous process.
    private var knownTaskIdentifiers = Set<Int>()
    private var responseBodies: [Int: Data] = [:]

    private var backgroundCompletionHandler: (() -> Void)?
    /// Set when the session finished delivering events before AppDelegate handed over the
    /// completion handler, so the handler is called as soon as it arrives instead of never.
    private var finishedEventsWithoutHandler = false

    private weak var listenerOwner: AnyObject?
    private var listener: (([String: Any]) -> Void)?

    /// `TransferProgressTask` on iOS 26 and later; typed loosely so older systems never touch it.
    private var progressTask: AnyObject?

    /// Last batch whose failure was announced, so each batch leaves at most one notification.
    private var announcedFailureBatch = 0

    private override init() {
        super.init()
        core = TransferCore(
            now: { Int64(ProcessInfo.processInfo.systemUptime * 1000) },
            emit: { [unowned self] snapshot in self.handle(snapshot) },
            log: { message in ChaticNativeLogger.log(tag: TransferSessionOwner.logTag, message: message) }
        )
        if #available(iOS 26.0, *) {
            progressTask = TransferProgressTask(identifier: Self.progressTaskIdentifier, owner: self)
        }
        queue.sync { makeSession() }
    }

    // MARK: - Session

    private func makeSession() {
        let configuration = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
        configuration.sessionSendsLaunchEvents = true
        configuration.isDiscretionary = false
        // timeoutIntervalForResource keeps its 7-day default on purpose: it bounds the whole
        // transfer, not idle time, so a lower value would cut a slow but healthy large upload.
        let delegateQueue = OperationQueue()
        delegateQueue.underlyingQueue = queue
        delegateQueue.maxConcurrentOperationCount = 1
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: delegateQueue)

        session.getAllTasks { [weak self] tasks in
            self?.queue.async { tasks.forEach { self?.adopt($0) } }
        }
    }

    /// Registers a task the OS carried over from a previous process. Only `taskDescription`
    /// (the transfer id) is read from it; the URL it holds is never used or logged.
    @discardableResult
    private func adopt(_ task: URLSessionTask) -> String? {
        guard !knownTaskIdentifiers.contains(task.taskIdentifier),
              let transferId = task.taskDescription, !transferId.isEmpty
        else { return nil }
        guard task.state == .running || task.state == .suspended else { return nil }
        knownTaskIdentifiers.insert(task.taskIdentifier)
        let restored = core.restore(
            transferId: transferId,
            direction: .upload,
            totalBytes: task.countOfBytesExpectedToSend,
            transferredBytes: task.countOfBytesSent
        )
        guard restored else { return nil }
        tasksById[transferId] = task
        if task.state == .suspended { task.resume() }
        ChaticNativeLogger.log(tag: Self.logTag, message: "[\(transferId)] restored from the background session")
        return transferId
    }

    /// Called from AppDelegate when iOS wakes the app for this session. The session already exists
    /// (it is created with the owner), so its delegate receives the pending events; the handler is
    /// held until they have all been delivered.
    func handleBackgroundEvents(identifier: String, completionHandler: @escaping () -> Void) {
        guard identifier == Self.sessionIdentifier else {
            // A session this build no longer creates: nothing will deliver its events.
            DispatchQueue.main.async(execute: completionHandler)
            return
        }
        queue.async {
            if self.finishedEventsWithoutHandler {
                self.finishedEventsWithoutHandler = false
                DispatchQueue.main.async(execute: completionHandler)
            } else {
                self.backgroundCompletionHandler = completionHandler
            }
        }
    }

    // MARK: - Commands (called by the RN module)

    func start(_ dictionary: [String: Any], completion: @escaping (TransferError?) -> Void) {
        queue.async {
            do {
                try self.startOnQueue(TransferRequest(dictionary: dictionary))
                completion(nil)
            } catch let error as TransferError {
                completion(error)
            } catch {
                completion(TransferError(code: .internal, message: TransferText.sanitize(error.localizedDescription)))
            }
        }
    }

    func cancel(_ transferId: String, completion: @escaping (TransferError?) -> Void) {
        queue.async {
            do {
                try self.core.cancel(transferId)
                self.stopTransports([transferId])
                completion(nil)
            } catch let error as TransferError {
                completion(error)
            } catch {
                completion(TransferError(code: .internal, message: TransferText.sanitize(error.localizedDescription)))
            }
        }
    }

    func list(completion: @escaping ([[String: Any]]) -> Void) {
        queue.async { completion(self.core.list().map(\.dictionary)) }
    }

    func ack(_ transferIds: [String], completion: @escaping (Int) -> Void) {
        queue.async { completion(self.core.ack(transferIds)) }
    }

    /// One listener at a time: the live RN module. A reloaded bridge registers its new module
    /// before the old one is torn down, so removal only applies to the registering owner.
    func setListener(_ owner: AnyObject, _ listener: @escaping ([String: Any]) -> Void) {
        queue.async {
            self.listenerOwner = owner
            self.listener = listener
        }
    }

    func removeListener(_ owner: AnyObject) {
        queue.async {
            guard self.listenerOwner === owner else { return }
            self.listenerOwner = nil
            self.listener = nil
        }
    }

    // MARK: - Internals (queue only)

    private func startOnQueue(_ request: TransferRequest) throws {
        try core.validate(request)
        // Validation has already refused anything that is not an http(s) URL with a host.
        guard let url = URL(string: request.url), let host = url.host else {
            throw TransferError(code: .invalid, message: "url must be an absolute http or https URL")
        }
        let fileURL = try Self.readableFileURL(request.fileUri)
        try TransferCore.checkSourceLength(actual: Self.fileLength(fileURL), declared: request.contentLength ?? 0)

        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "PUT"
        for (name, value) in TransferText.requestHeaders(request.headers, contentType: request.contentType) {
            urlRequest.setValue(value, forHTTPHeaderField: name)
        }

        try core.start(request)
        // The original file is the body: a whole-body PUT from a background session needs no copy.
        let task = session.uploadTask(with: urlRequest, fromFile: fileURL)
        // Only the id goes here. The OS persists the task across launches, and the URL carries a
        // signed credential that must not be stored by us.
        task.taskDescription = request.transferId
        tasksById[request.transferId] = task
        knownTaskIdentifiers.insert(task.taskIdentifier)
        task.resume()
        ChaticNativeLogger.log(tag: Self.logTag, message: "[\(request.transferId)] upload started to \(host)")

        startProgressTaskIfForeground()
    }

    /// Background sessions only upload from files, and only local files can be read.
    private static func readableFileURL(_ uri: String) throws -> URL {
        guard let fileURL = TransferText.localFileURL(uri) else {
            throw TransferError(code: .source, message: "only a file:// URI or an absolute path can be uploaded")
        }
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: fileURL.path, isDirectory: &isDirectory), !isDirectory.boolValue,
              FileManager.default.isReadableFile(atPath: fileURL.path)
        else {
            throw TransferError(code: .source, message: "the file cannot be read")
        }
        return fileURL
    }

    private static func fileLength(_ fileURL: URL) throws -> Int64 {
        guard let size = (try? FileManager.default.attributesOfItem(atPath: fileURL.path))?[.size] as? NSNumber else {
            throw TransferError(code: .source, message: "the file size cannot be read")
        }
        return size.int64Value
    }

    func stopTransports(_ transferIds: [String]) {
        for id in transferIds {
            tasksById.removeValue(forKey: id)?.cancel()
        }
    }

    /// Continued-processing expiration: the rule (cancel everything running) is the core's.
    func expireForProgressTask() {
        stopTransports(core.continuedTaskExpired())
    }

    var coreForProgressTask: TransferCore { core }

    /// The core's clock: monotonic milliseconds, immune to wall-clock changes.
    func nowMs() -> Int64 { Int64(ProcessInfo.processInfo.systemUptime * 1000) }

    private func handle(_ snapshot: TransferSnapshot) {
        listener?(snapshot.dictionary)
        if snapshot.state.isTerminal {
            ChaticNativeLogger.log(tag: Self.logTag, message: "[\(snapshot.transferId)] \(snapshot.state.rawValue)")
            if let notice = core.batchFailureNotice(), notice.batchSequence != announcedFailureBatch {
                announcedFailureBatch = notice.batchSequence
                notifyFailure(notice)
            }
        }
        refreshProgressTask()
    }

    private func refreshProgressTask() {
        if #available(iOS 26.0, *) {
            (progressTask as? TransferProgressTask)?.refresh()
        }
    }

    /// The system progress UI may only be requested by the foreground app in response to the user,
    /// which a `start` from the web is.
    ///
    /// It is asked for only if something is still running after `progressTaskDelay`. Leaving the
    /// app within that window loses the UI for this batch, not the transfer — the bytes move through
    /// the background session either way; the task only keeps the app awake to show progress.
    private func startProgressTaskIfForeground() {
        guard #available(iOS 26.0, *), let progressTask = progressTask as? TransferProgressTask else { return }
        queue.asyncAfter(deadline: .now() + Self.progressTaskDelay) {
            guard self.core.runningCount > 0 else { return }
            DispatchQueue.main.async {
                guard UIApplication.shared.applicationState == .active else { return }
                self.queue.async { progressTask.userStarted() }
            }
        }
    }

    /// A failure while the user is away is otherwise invisible until they come back, so a batch
    /// that ends with one leaves a single notification: the file's title for a one-file batch, a
    /// count otherwise. Success is not announced: it shows in the app. Permission is never
    /// requested here; the app already asks for it for push, and without it nothing is shown.
    private func notifyFailure(_ notice: TransferFailureNotice) {
        DispatchQueue.main.async {
            guard UIApplication.shared.applicationState != .active else { return }
            let center = UNUserNotificationCenter.current()
            center.getNotificationSettings { settings in
                guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else { return }
                let content = UNMutableNotificationContent()
                content.title = NSLocalizedString("transfer_failed_title", value: "Upload failed", comment: "Notification title when a background upload fails")
                if notice.memberCount > 1 {
                    let format = NSLocalizedString("transfer_failed_body_summary", value: "%1$d of %2$d uploads failed", comment: "Notification body when some uploads of a batch fail")
                    content.body = String(format: format, notice.failedCount, notice.memberCount)
                } else if let title = notice.singleTitle, !title.isEmpty {
                    content.body = title
                } else {
                    content.body = NSLocalizedString("transfer_failed_body_default", value: "A file could not be uploaded.", comment: "Notification body when the failed upload has no title")
                }
                content.sound = .default
                center.add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil))
            }
        }
    }

    /// The transfer id of a task, adopting it first when it belongs to a previous process and
    /// `getAllTasks` has not reported it yet.
    private func transferId(for task: URLSessionTask) -> String? {
        if knownTaskIdentifiers.contains(task.taskIdentifier) {
            return task.taskDescription
        }
        return adopt(task)
    }
}

// MARK: - URLSession delegate

extension TransferSessionOwner: URLSessionDataDelegate {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didSendBodyData bytesSent: Int64,
        totalBytesSent: Int64,
        totalBytesExpectedToSend: Int64
    ) {
        guard let id = transferId(for: task) else { return }
        core.progress(id, bytes: totalBytesSent)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        var body = responseBodies[dataTask.taskIdentifier] ?? Data()
        let room = Self.maxResponseBodyBytes - body.count
        guard room > 0 else { return }
        body.append(data.prefix(room))
        responseBodies[dataTask.taskIdentifier] = body
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let body = responseBodies.removeValue(forKey: task.taskIdentifier)
        let known = knownTaskIdentifiers.contains(task.taskIdentifier)
        guard let id = task.taskDescription, !id.isEmpty else { return }

        if !known {
            // Finished while no process was around to watch it. A cancellation here is the OS
            // cleaning up after a force quit, which the contract reports as nothing at all.
            if (error as NSError?)?.code == NSURLErrorCancelled { return }
            knownTaskIdentifiers.insert(task.taskIdentifier)
            guard core.restore(
                transferId: id,
                direction: .upload,
                totalBytes: task.countOfBytesExpectedToSend,
                transferredBytes: task.countOfBytesSent
            ) else { return }
        }
        if tasksById[id]?.taskIdentifier == task.taskIdentifier {
            tasksById.removeValue(forKey: id)
        }

        // Our own cancel lands here as NSURLErrorCancelled; the core already holds `cancelled` and
        // ignores it. Any other status is passed on unjudged.
        if let error {
            core.failure(id, code: .network, message: error.localizedDescription)
        } else if let response = task.response as? HTTPURLResponse {
            core.progress(id, bytes: TransferCore.sentBytesAtCompletion(
                countSent: task.countOfBytesSent,
                countExpected: task.countOfBytesExpectedToSend,
                fraction: task.progress.fractionCompleted,
                declared: core.declaredBytes(id)
            ))
            core.response(id, status: response.statusCode, body: body)
        } else {
            core.failure(id, code: .network, message: "no HTTP response")
        }
    }

    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        guard let handler = backgroundCompletionHandler else {
            finishedEventsWithoutHandler = true
            return
        }
        backgroundCompletionHandler = nil
        DispatchQueue.main.async(execute: handler)
    }
}
