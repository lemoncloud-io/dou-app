import BackgroundTasks
import Foundation

/// The iOS 26 system progress UI for transfers, backed by one `BGContinuedProcessingTask`.
///
/// The bytes still move through the background `URLSession`; this task only keeps the app awake
/// so progress callbacks arrive and the system can show them. Every decision (the byte-weighted
/// ratio, when to close on a stall, what an expiration means) comes from `TransferCore`; this
/// class just carries it out.
///
/// There is at most one task. A start while one is pending or active joins it, so the whole set
/// of transfers shows as one bar, and the system's cap on concurrent tasks is never hit.
///
/// All state is touched on the owner's queue; the launch handler is registered on it too.
@available(iOS 26.0, *)
final class TransferProgressTask {
    private static let unitCount: Int64 = 1000
    private static let stallCheckInterval: DispatchTimeInterval = .seconds(1)

    private enum Phase {
        case idle
        /// Submitted, waiting for the system to launch it.
        case pending
        case active(BGContinuedProcessingTask)
    }

    private let identifier: String
    private unowned let owner: TransferSessionOwner
    private var phase = Phase.idle
    private var registered = false
    private var registrationFailed = false
    private var timer: DispatchSourceTimer?
    private var shownSubtitle: String?

    init(identifier: String, owner: TransferSessionOwner) {
        self.identifier = identifier
        self.owner = owner
    }

    /// A transfer was started by the user while the app is in the foreground — the only moment
    /// the system accepts a request. Later starts join the existing task.
    func userStarted() {
        switch phase {
        case .pending:
            return
        case .active:
            refresh()
        case .idle:
            submit()
        }
    }

    /// Called on every event and every second while active.
    func refresh() {
        let core = owner.coreForProgressTask
        if case .pending = phase, core.runningUploadCount == 0 {
            // Everything ended before the system got round to launching the request; withdraw
            // it so the next start submits a fresh one instead of waiting on this one.
            BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: identifier)
            phase = .idle
            return
        }
        guard case let .active(task) = phase else { return }
        let aggregate = core.batchAggregate()

        if core.runningUploadCount == 0 {
            complete(task, success: !(aggregate?.anyFailed ?? false))
            return
        }
        if core.shouldCloseContinuedTask(now: owner.nowMs()) {
            // Bytes stopped moving (usually waiting for a connection). Close the UI but leave the
            // transfers running in the session: the system ends stalled tasks first, and an
            // expiration it forces would otherwise cancel uploads that are merely waiting.
            // It is not reopened until the next user-initiated start.
            complete(task, success: true)
            return
        }
        guard let aggregate else { return }
        if let ratio = aggregate.ratio {
            let units = Int64((ratio * Double(Self.unitCount)).rounded(.down))
            task.progress.completedUnitCount = min(max(units, 0), Self.unitCount)
        }
        let subtitle = Self.subtitle(for: aggregate)
        if subtitle != shownSubtitle {
            shownSubtitle = subtitle
            task.updateTitle(Self.title, subtitle: subtitle)
        }
    }

    // MARK: - Internals

    private static var title: String {
        NSLocalizedString("transfer_progress_title", value: "Uploading", comment: "System progress UI title while files upload")
    }

    private static func subtitle(for aggregate: TransferBatchAggregate) -> String {
        if aggregate.memberCount == 1 {
            if let title = aggregate.singleTitle, !title.isEmpty { return title }
            return NSLocalizedString("transfer_progress_subtitle_one", value: "1 file", comment: "System progress UI subtitle for a single file")
        }
        let format = NSLocalizedString("transfer_progress_subtitle_many", value: "%d files", comment: "System progress UI subtitle, number of files")
        return String(format: format, aggregate.memberCount)
    }

    private func submit() {
        guard registerOnce() else { return }
        let aggregate = owner.coreForProgressTask.batchAggregate()
        let subtitle = aggregate.map(Self.subtitle(for:)) ?? ""
        let request = BGContinuedProcessingTaskRequest(identifier: identifier, title: Self.title, subtitle: subtitle)
        do {
            try BGTaskScheduler.shared.submit(request)
            phase = .pending
            shownSubtitle = subtitle
        } catch {
            ChaticNativeLogger.log(level: "warn", tag: "TRANSFER", message: "progress task was not submitted", error: error)
        }
    }

    /// Registering the same identifier twice kills the app, so it happens once per process, on
    /// first use (continued-processing handlers are exempt from the launch-time rule).
    private func registerOnce() -> Bool {
        if registered { return !registrationFailed }
        registered = true
        let ok = BGTaskScheduler.shared.register(forTaskWithIdentifier: identifier, using: owner.queue) { [weak self] task in
            self?.launched(task)
        }
        if !ok {
            registrationFailed = true
            ChaticNativeLogger.log(level: "warn", tag: "TRANSFER", message: "progress task identifier is not permitted in Info.plist")
        }
        return ok
    }

    private func launched(_ task: BGTask) {
        guard let task = task as? BGContinuedProcessingTask else {
            task.setTaskCompleted(success: false)
            return
        }
        phase = .active(task)
        task.progress.totalUnitCount = Self.unitCount
        task.expirationHandler = { [weak self] in
            self?.owner.queue.async { self?.expired(task) }
        }
        startTimer()
        refresh()
    }

    /// The user cancelled from the system UI, or the system reclaimed the task; iOS does not say
    /// which, and the core treats both as a cancel of everything running.
    private func expired(_ task: BGContinuedProcessingTask) {
        guard case let .active(current) = phase, current === task else { return }
        // Detach first so the cancelled events below do not complete the task as a success.
        reset()
        owner.expireForProgressTask()
        task.setTaskCompleted(success: false)
    }

    private func complete(_ task: BGContinuedProcessingTask, success: Bool) {
        reset()
        task.setTaskCompleted(success: success)
    }

    private func reset() {
        phase = .idle
        shownSubtitle = nil
        timer?.cancel()
        timer = nil
    }

    private func startTimer() {
        timer?.cancel()
        let timer = DispatchSource.makeTimerSource(queue: owner.queue)
        timer.schedule(deadline: .now() + Self.stallCheckInterval, repeating: Self.stallCheckInterval)
        timer.setEventHandler { [weak self] in self?.refresh() }
        timer.resume()
        self.timer = timer
    }
}
