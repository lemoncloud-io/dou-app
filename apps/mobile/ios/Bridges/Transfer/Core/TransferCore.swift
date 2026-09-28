import Foundation

/// Every decision the native transfer layer makes, with no platform code in it.
///
/// The OS layer feeds in what happened (progress, a response, a connection failure, a cancel
/// request, a timer tick) and carries out what comes back: emit this event, stop that transport,
/// close the system progress UI. Keeping the rules here lets one unit-test list pin them on both
/// platforms.
///
/// Not thread-safe by design: the owner calls it from one serial queue, which is simpler than
/// locking inside and matches how the Android side is driven.
final class TransferCore {
    static let progressThrottleMs: Int64 = 200
    static let retentionCap = 100
    static let stallTimeoutMs: Int64 = 30_000

    private final class Entry {
        let transferId: String
        let direction: TransferDirection
        let totalBytes: Int64
        let title: String?
        let startSeq: Int
        var state: TransferState = .running
        var transferredBytes: Int64 = 0
        var httpStatus: Int?
        var providerCode: String?
        var errorCode: TransferErrorCode?
        var errorMessage: String?
        var terminalSeq: Int?
        var lastEmittedAt: Int64?
        var lastProgressAt: Int64?

        init(transferId: String, direction: TransferDirection, totalBytes: Int64, title: String?, startSeq: Int) {
            self.transferId = transferId
            self.direction = direction
            self.totalBytes = totalBytes
            self.title = title
            self.startSeq = startSeq
        }

        var snapshot: TransferSnapshot {
            TransferSnapshot(
                transferId: transferId,
                direction: direction,
                state: state,
                transferredBytes: transferredBytes,
                totalBytes: totalBytes,
                httpStatus: httpStatus,
                providerCode: providerCode,
                errorCode: errorCode,
                errorMessage: errorMessage,
                title: title
            )
        }
    }

    /// A batch keeps its own copy of each member's numbers so an acknowledged (removed) member
    /// still counts as settled in the aggregate.
    private struct BatchMember {
        let transferId: String
        let totalBytes: Int64
        let title: String?
        var settled = false
        var failed = false
    }

    private let now: () -> Int64
    private let emit: (TransferSnapshot) -> Void
    private let log: (String) -> Void

    private var entries: [String: Entry] = [:]
    private var seq = 0

    private var batch: [BatchMember] = []
    private var batchLastProgressAt: Int64 = 0
    /// Numbers the batches of this process, so a batch's failure is announced once.
    private var batchSequence = 0

    /// - Parameters:
    ///   - now: Clock in milliseconds. Injected so tests control time.
    ///   - emit: Receives every event the bridge should see, synchronously.
    ///   - log: Diagnostic lines. They carry ids only, never a URL.
    init(now: @escaping () -> Int64, emit: @escaping (TransferSnapshot) -> Void, log: @escaping (String) -> Void = { _ in }) {
        self.now = now
        self.emit = emit
        self.log = log
    }

    // MARK: - Commands

    /// Rejects a request the contract does not allow. Separate from `start` so the OS layer can run
    /// its own check of the file after this and before anything is registered.
    func validate(_ request: TransferRequest) throws {
        func invalid(_ message: String) -> TransferError { TransferError(code: .invalid, message: message) }

        if request.transferId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw invalid("transferId is required")
        }
        if entries[request.transferId] != nil {
            throw invalid("transferId is already in use")
        }
        guard let direction = TransferDirection(rawValue: request.direction) else {
            throw invalid("unknown direction")
        }
        if direction == .download {
            throw invalid("download is not implemented")
        }
        if request.method != "PUT" {
            throw invalid("upload requires PUT")
        }
        if !TransferText.isTransferURL(request.url) {
            throw invalid("url must be an absolute http or https URL")
        }
        if request.fileUri.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw invalid("file.uri is required")
        }
        guard let length = request.contentLength, length >= 0 else {
            throw invalid("upload requires file.contentLength >= 0")
        }
    }

    /// The declared length is the progress denominator and, for a signed PUT, usually part of the
    /// signature; a file that no longer matches it cannot produce a valid upload.
    static func checkSourceLength(actual: Int64, declared: Int64) throws {
        guard actual == declared else {
            throw TransferError(code: .source, message: "file length \(actual) differs from contentLength \(declared)")
        }
    }

    /// Registers the transfer and emits its first `running` event straight away, so the web learns
    /// it was accepted without waiting for the first progress tick.
    func start(_ request: TransferRequest) throws {
        try validate(request)
        register(
            transferId: request.transferId,
            direction: .upload,
            totalBytes: request.contentLength ?? 0,
            transferredBytes: 0,
            title: request.title
        )
    }

    /// Re-registers a transfer the OS was still running when this process started (the background
    /// session outlives the app). Returns `false` when the id is already held, so a restore that
    /// races a live callback does not reset it.
    @discardableResult
    func restore(transferId: String, direction: TransferDirection, totalBytes: Int64, transferredBytes: Int64) -> Bool {
        if transferId.isEmpty || entries[transferId] != nil { return false }
        let total = max(totalBytes, 0)
        var bytes = max(transferredBytes, 0)
        if total > 0 { bytes = min(bytes, total) }
        register(transferId: transferId, direction: direction, totalBytes: total, transferredBytes: bytes, title: nil)
        return true
    }

    func progress(_ transferId: String, bytes: Int64) {
        guard let entry = runningEntry(transferId) else { return }
        var clamped = max(bytes, entry.transferredBytes)
        if entry.totalBytes > 0 { clamped = min(clamped, entry.totalBytes) }
        guard clamped > entry.transferredBytes else { return }

        let time = now()
        entry.transferredBytes = clamped
        entry.lastProgressAt = time
        if isBatchMember(transferId) { batchLastProgressAt = time }

        if let last = entry.lastEmittedAt, time - last < Self.progressThrottleMs { return }
        entry.lastEmittedAt = time
        emit(entry.snapshot)
    }

    /// An HTTP response of any status is `responded`; what it means is decided above the shell.
    func response(_ transferId: String, status: Int, body: Data?) {
        guard let entry = runningEntry(transferId) else { return }
        entry.httpStatus = status
        entry.providerCode = status >= 300 ? TransferText.providerCode(from: body) : nil
        finish(entry, as: .responded)
    }

    func failure(_ transferId: String, code: TransferErrorCode, message: String) {
        guard let entry = runningEntry(transferId) else { return }
        entry.errorCode = code
        entry.errorMessage = TransferText.sanitize(message)
        finish(entry, as: .failed)
    }

    /// The caller must stop the transport after this returns. Whatever it still reports for this id
    /// is then ignored, which is what makes cancel-versus-response a clean race.
    func cancel(_ transferId: String) throws {
        guard let entry = runningEntry(transferId) else {
            throw TransferError(code: .invalid, message: "transfer is not running")
        }
        finish(entry, as: .cancelled)
    }

    /// Fails every running transfer with `code`. Returns their ids so the OS layer stops them.
    func failAllRunning(code: TransferErrorCode) -> [String] {
        let running = runningEntriesInOrder()
        for entry in running {
            entry.errorCode = code
            entry.errorMessage = nil
            finish(entry, as: .failed)
        }
        return running.map(\.transferId)
    }

    /// The system ended the continued-processing task. It does not say whether the user or the
    /// system did it, so it is treated as the user's cancel: every running transfer is cancelled
    /// and the web sees an ordinary `cancelled` it can act on. Returns the ids to stop.
    func continuedTaskExpired() -> [String] {
        let running = runningEntriesInOrder()
        running.forEach { finish($0, as: .cancelled) }
        return running.map(\.transferId)
    }

    /// Whether to close the system progress UI because bytes stopped moving (typically waiting
    /// for a connection). Closing it early keeps an expiration, when one comes, likely to be the
    /// user's own cancel. It never cancels anything: the transfer keeps waiting in the OS session.
    func shouldCloseContinuedTask(now time: Int64) -> Bool {
        guard !runningEntriesInOrder().isEmpty else { return false }
        return time - batchLastProgressAt >= Self.stallTimeoutMs
    }

    // MARK: - Queries

    /// Running transfers plus terminal ones not yet acknowledged, in start order.
    func list() -> [TransferSnapshot] {
        entries.values.sorted { $0.startSeq < $1.startSeq }.map(\.snapshot)
    }

    /// Drops the terminal entries among `transferIds`; running and unknown ids are ignored.
    /// Returns how many entries remain.
    func ack(_ transferIds: [String]) -> Int {
        for id in transferIds where entries[id]?.state.isTerminal == true {
            entries.removeValue(forKey: id)
        }
        return entries.count
    }

    var runningCount: Int { entries.values.filter { $0.state == .running }.count }

    func isRunning(_ transferId: String) -> Bool { runningEntry(transferId) != nil }

    /// `nil` when no batch has started in this process.
    func batchAggregate() -> TransferBatchAggregate? {
        guard !batch.isEmpty else { return nil }
        var counted: Int64 = 0
        var total: Int64 = 0
        var running = 0
        var unknownTotal = false
        var anyFailed = false
        for member in batch {
            total += member.totalBytes
            if member.totalBytes == 0 { unknownTotal = true }
            if member.failed { anyFailed = true }
            if member.settled {
                counted += member.totalBytes
            } else {
                running += 1
                counted += entries[member.transferId]?.transferredBytes ?? 0
            }
        }
        let ratio: Double? = unknownTotal || total == 0 ? nil : Double(counted) / Double(total)
        return TransferBatchAggregate(
            memberCount: batch.count,
            runningCount: running,
            countedBytes: counted,
            totalBytes: total,
            ratio: ratio,
            anyFailed: anyFailed,
            singleTitle: batch.count == 1 ? batch[0].title : nil
        )
    }

    /// The one failure announcement a finished batch leaves, or `nil` when it should leave none:
    /// the batch is still running, or nothing in it failed. Success is not announced.
    func batchFailureNotice() -> TransferFailureNotice? {
        guard !batch.isEmpty, batch.allSatisfy(\.settled) else { return nil }
        let failed = batch.filter(\.failed).count
        guard failed > 0 else { return nil }
        return TransferFailureNotice(
            batchSequence: batchSequence,
            failedCount: failed,
            memberCount: batch.count,
            singleTitle: batch.count == 1 ? batch[0].title : nil
        )
    }

    // MARK: - Internals

    private func register(transferId: String, direction: TransferDirection, totalBytes: Int64, transferredBytes: Int64, title: String?) {
        let time = now()
        // A transfer that starts while nothing runs opens a new batch; one that starts while
        // others run joins theirs, so the progress UI shows the whole set as one bar.
        if runningEntriesInOrder().isEmpty {
            batch = []
            batchLastProgressAt = time
            batchSequence += 1
        }
        seq += 1
        let entry = Entry(transferId: transferId, direction: direction, totalBytes: totalBytes, title: title, startSeq: seq)
        entry.transferredBytes = transferredBytes
        entry.lastEmittedAt = time
        entries[transferId] = entry
        batch.append(BatchMember(transferId: transferId, totalBytes: totalBytes, title: title))
        emit(entry.snapshot)
    }

    private func runningEntry(_ transferId: String) -> Entry? {
        guard let entry = entries[transferId], entry.state == .running else { return nil }
        return entry
    }

    private func runningEntriesInOrder() -> [Entry] {
        entries.values.filter { $0.state == .running }.sorted { $0.startSeq < $1.startSeq }
    }

    private func isBatchMember(_ transferId: String) -> Bool {
        batch.contains { $0.transferId == transferId }
    }

    private func finish(_ entry: Entry, as state: TransferState) {
        seq += 1
        entry.state = state
        entry.terminalSeq = seq
        entry.lastEmittedAt = now()
        if let index = batch.firstIndex(where: { $0.transferId == entry.transferId }) {
            batch[index].settled = true
            batch[index].failed = state == .failed
        }
        enforceRetentionCap()
        emit(entry.snapshot)
    }

    /// Keeps memory bounded when the web stops acknowledging: the oldest result goes first.
    private func enforceRetentionCap() {
        let terminal = entries.values.filter { $0.state.isTerminal }
        guard terminal.count > Self.retentionCap else { return }
        let overflow = terminal.sorted { ($0.terminalSeq ?? 0) < ($1.terminalSeq ?? 0) }.prefix(terminal.count - Self.retentionCap)
        for entry in overflow {
            entries.removeValue(forKey: entry.transferId)
            log("retention cap reached, dropped unacknowledged result \(entry.transferId)")
        }
    }
}
