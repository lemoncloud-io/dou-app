import Foundation

// MARK: - UploadChunkContext

/// Context for a single chunk upload task.
/// Used inside URLSessionTaskDelegate callbacks to identify which uploadId and which chunk index a task belongs to.
final class UploadChunkContext {
    let uploadId: String
    let chunkIndex: Int
    let totalChunks: Int
    let offset: Int64
    let length: Int
    let totalBytes: Int64
    /// Current retry count (0-based; up to 2 retries = 3 attempts total)
    var retryAttempt: Int = 0
    /// URL of the temp file the multipart body was written to (reused on retry)
    var tempFileURL: URL?
    /// multipart boundary (reused for the same request on retry)
    let boundary: String

    init(uploadId: String, chunkIndex: Int, totalChunks: Int,
         offset: Int64, length: Int, totalBytes: Int64, boundary: String) {
        self.uploadId = uploadId
        self.chunkIndex = chunkIndex
        self.totalChunks = totalChunks
        self.offset = offset
        self.length = length
        self.totalBytes = totalBytes
        self.boundary = boundary
    }
}

// MARK: - UploadState

/// Container for an upload task's state.
final class UploadState {
    let uploadId: String
    var payload: [String: Any]
    var status: String = "queued"
    var uploadedBytes: Int64 = 0
    var lastChunkIndex: Int = 0
    var retryAttempt: Int = 0
    var paused: Bool = false
    var cancelled: Bool = false
    /// One background URLSession per uploadId
    var session: URLSession?
    /// The URLSessionTask currently in progress (referenced on pause/cancel)
    weak var currentTask: URLSessionTask?

    init(uploadId: String, payload: [String: Any]) {
        self.uploadId = uploadId
        self.payload = payload
    }
}

// MARK: - UploadManager

/// The iOS native chunked upload engine.
///
/// Structure:
/// - URLSession background configuration — the OS keeps the transfer going even after the app is backgrounded.
/// - A temp file is created per chunk and sent with `uploadTask(with:fromFile:)` (file-based, no completionHandler).
/// - Background sessions can't use completionHandler blocks, so results are handled via URLSessionTaskDelegate instead.
/// - An event-driven structure where the delegate kicks off the next chunk as soon as the current one finishes.
///
/// Warning, about testing against localhost:
/// Background URLSession transfers go through the `nsurlsessiond` daemon,
/// so testing against localhost from the Simulator may fail to connect.
/// Use a real IP (e.g. 192.168.x.x) or test on a physical device instead.
@objc(UploadManager)
final class UploadManager: RCTEventEmitter, URLSessionTaskDelegate {

    // MARK: - State

    /// Queue that serializes all state changes (thread safety)
    private let stateQueue = DispatchQueue(label: "io.chatic.dou.upload.state", qos: .utility)
    private var states: [String: UploadState] = [:]
    /// NSURLSessionTask.taskIdentifier → UploadChunkContext
    private var contexts: [Int: UploadChunkContext] = [:]
    /// completionHandler received from AppDelegate when the background session finishes
    private var backgroundHandlers: [String: () -> Void] = [:]
    private var hasListeners = false

    // MARK: - RCTEventEmitter

    @objc override static func requiresMainQueueSetup() -> Bool { false }

    override func supportedEvents() -> [String]! { ["UploadManagerStateChanged"] }

    override func startObserving() { hasListeners = true }
    override func stopObserving()  { hasListeners = false }

    // MARK: - AppDelegate integration

    /// Called by AppDelegate when iOS wakes the app after a background URLSession completes.
    /// Handled in `urlSessionDidFinishEvents(forBackgroundURLSession:)`.
    @objc func handleBackgroundSession(_ identifier: String, completionHandler: @escaping () -> Void) {
        stateQueue.async { [weak self] in
            self?.backgroundHandlers[identifier] = completionHandler
        }
    }

    // MARK: - Event emission

    private func emitState(_ state: UploadState, progress: Double, totalBytes: Int64, errorMessage: String? = nil) {
        guard hasListeners else { return }
        var event: [String: Any] = [
            "uploadId":       state.uploadId,
            "status":         state.status,
            "progress":       progress,
            "uploadedBytes":  Double(state.uploadedBytes),
            "totalBytes":     Double(totalBytes),
            "lastChunkIndex": state.lastChunkIndex,
            "retryAttempt":   state.retryAttempt,
        ]
        if let msg = errorMessage { event["errorMessage"] = msg }
        sendEvent(withName: "UploadManagerStateChanged", body: event)
    }

    // MARK: - File I/O helpers

    /// Reads binary data of a given offset/length from the file
    private func readChunkData(fileUri: String, offset: Int64, length: Int) throws -> Data {
        var path = fileUri
        if path.hasPrefix("file://") { path = String(path.dropFirst(7)) }
        path = (path.removingPercentEncoding ?? path)
            .decomposedStringWithCanonicalMapping

        guard let handle = FileHandle(forReadingAtPath: path) else {
            throw NSError(domain: "UploadManager", code: -1, userInfo: [
                NSLocalizedDescriptionKey: "Cannot open file: \(path)"
            ])
        }
        defer { handle.closeFile() }

        let fileSize = handle.seekToEndOfFile()
        guard UInt64(offset) < fileSize else { return Data() }
        let readLen = min(UInt64(length), fileSize - UInt64(offset))
        handle.seek(toFileOffset: UInt64(offset))
        return handle.readData(ofLength: Int(readLen))
    }

    /// Saves the multipart body to a temp file (background sessions only support file-based transfers)
    private func writeChunkToTempFile(_ data: Data, uploadId: String, chunkIndex: Int) -> URL {
        let fileName = "chunk_\(uploadId)_\(chunkIndex).bin"
        let url = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent(fileName)
        try? data.write(to: url, options: .atomic)
        return url
    }

    private func deleteTempChunkFile(_ url: URL?) {
        guard let url else { return }
        try? FileManager.default.removeItem(at: url)
    }

    // MARK: - Multipart builder

    /// Assembles the multipart/form-data body (binary, not base64)
    private func buildMultipartBody(chunkData: Data, boundary: String, chunkIndex: Int) -> Data {
        var body = Data()
        let CRLF = "\r\n"
        let header = "--\(boundary)\(CRLF)"
            + "Content-Disposition: form-data; name=\"file\"; filename=\"chunk_\(chunkIndex)\"\(CRLF)"
            + "Content-Type: application/octet-stream\(CRLF)"
            + CRLF
        body.append(contentsOf: header.utf8)
        body.append(chunkData)
        body.append(contentsOf: "\(CRLF)--\(boundary)--\(CRLF)".utf8)
        return body
    }

    /// Builds the URLRequest for a chunk upload (headers only, no HTTPBody)
    private func buildRequest(ctx: UploadChunkContext, payload: [String: Any]) -> URLRequest? {
        let uploadUrl = payload["uploadUrl"] as? String ?? ""
        guard let url = URL(string: uploadUrl) else { return nil }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("multipart/form-data; boundary=\(ctx.boundary)", forHTTPHeaderField: "Content-Type")
        req.setValue(payload["uploadId"] as? String ?? "",           forHTTPHeaderField: "X-Upload-ID")
        req.setValue("\(ctx.chunkIndex)",                             forHTTPHeaderField: "X-Chunk-Index")
        req.setValue("\(ctx.totalChunks)",                            forHTTPHeaderField: "X-Total-Chunks")
        req.setValue("\(ctx.offset)",                                 forHTTPHeaderField: "X-Chunk-Offset")
        req.setValue("\(ctx.length)",                                 forHTTPHeaderField: "X-Chunk-Size")
        req.setValue("\(ctx.totalBytes)",                             forHTTPHeaderField: "X-File-Size")
        let fileName = (payload["fileName"] as? String ?? "file")
            .addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "file"
        req.setValue(fileName,                                        forHTTPHeaderField: "X-File-Name")
        req.setValue(payload["mimeType"] as? String ?? "application/octet-stream",
                                                                      forHTTPHeaderField: "X-Mime-Type")
        if let headers = payload["headers"] as? [String: String] {
            headers.forEach { req.setValue($1, forHTTPHeaderField: $0) }
        }
        return req
    }

    // MARK: - Backoff / retry

    private func backoffSeconds(attempt: Int) -> TimeInterval {
        return min(0.5 * pow(2.0, Double(attempt - 1)), 5.0) // 0.5s, 1s, 2s, max 5s
    }

    private func isRetryable(error: Error?, statusCode: Int) -> Bool {
        if let e = error as NSError?, e.code == NSURLErrorCancelled { return false }
        return error != nil || (statusCode >= 500 && statusCode <= 599)
    }

    // MARK: - Starting a chunk (the core of the event-driven flow)

    /// Reads the chunk at the given chunkIndex, writes it to a temp file, and creates/starts the URLSession upload task.
    /// - This method must not be called on stateQueue (it does blocking file I/O).
    private func startChunk(_ chunkIndex: Int, state: UploadState) {
        guard !state.cancelled, !state.paused else { return }

        let payload = state.payload
        let fileUri   = payload["fileUri"] as? String ?? ""
        let totalBytes = (payload["fileSize"] as? NSNumber)?.int64Value ?? 0
        let chunkSz   = max((payload["chunkSize"] as? Int) ?? (1024 * 1024), 1)
        let totalChunks = Int((totalBytes + Int64(chunkSz) - 1) / Int64(chunkSz))
        let offset    = Int64(chunkIndex) * Int64(chunkSz)
        let length    = Int(min(Int64(chunkSz), totalBytes - offset))

        // Read the chunk's binary data
        let chunkData: Data
        do {
            chunkData = try readChunkData(fileUri: fileUri, offset: offset, length: length)
        } catch {
            stateQueue.async { [weak self] in
                state.status = "failed"
                self?.emitState(state,
                                progress: Double(state.uploadedBytes) / Double(max(totalBytes, 1)),
                                totalBytes: totalBytes,
                                errorMessage: error.localizedDescription)
                state.session?.invalidateAndCancel(); state.session = nil
                self?.states.removeValue(forKey: state.uploadId)
            }
            return
        }

        let boundary = "UploadBoundary\(UUID().uuidString.replacingOccurrences(of: "-", with: ""))"
        let ctx = UploadChunkContext(
            uploadId: state.uploadId,
            chunkIndex: chunkIndex,
            totalChunks: totalChunks,
            offset: offset,
            length: length,
            totalBytes: totalBytes,
            boundary: boundary
        )

        // multipart body → temp file
        let body = buildMultipartBody(chunkData: chunkData, boundary: boundary, chunkIndex: chunkIndex)
        ctx.tempFileURL = writeChunkToTempFile(body, uploadId: state.uploadId, chunkIndex: chunkIndex)

        stateQueue.async { [weak self] in
            self?.submitChunk(ctx: ctx, state: state)
        }
    }

    /// Creates, registers, and starts a URLSession upload task based on the context.
    /// Warning: must be called on stateQueue.
    private func submitChunk(ctx: UploadChunkContext, state: UploadState) {
        guard !state.cancelled, !state.paused else {
            deleteTempChunkFile(ctx.tempFileURL); return
        }
        guard let session = state.session else {
            deleteTempChunkFile(ctx.tempFileURL); return
        }
        guard let tempURL = ctx.tempFileURL else { return }
        guard let request = buildRequest(ctx: ctx, payload: state.payload) else {
            state.status = "failed"
            emitState(state, progress: 0, totalBytes: ctx.totalBytes, errorMessage: "Invalid upload URL")
            deleteTempChunkFile(ctx.tempFileURL)
            return
        }

        // A file-based upload task with no completionHandler (required for background sessions)
        let task = session.uploadTask(with: request, fromFile: tempURL)
        state.currentTask = task
        state.retryAttempt = ctx.retryAttempt
        contexts[task.taskIdentifier] = ctx
        task.resume()
    }

    // MARK: - Background URLSession creation helper

    private func makeSession(for uploadId: String) -> URLSession {
        let sessionId = "io.chatic.dou.upload.\(uploadId)"
        let config = URLSessionConfiguration.background(withIdentifier: sessionId)
        config.isDiscretionary = false          // Run immediately since it's a user-initiated request
        config.sessionSendsLaunchEvents = true  // Allow waking the app on completion
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }

    // MARK: - React Native API

    @objc func enqueueUpload(_ payload: [String: Any],
                              resolve: @escaping RCTPromiseResolveBlock,
                              reject: @escaping RCTPromiseRejectBlock) {
        guard let uploadId = payload["uploadId"] as? String, !uploadId.isEmpty,
              let fileUri  = payload["fileUri"]  as? String, !fileUri.isEmpty,
              let uploadUrl = payload["uploadUrl"] as? String, !uploadUrl.isEmpty,
              let fileSize  = payload["fileSize"] as? NSNumber
        else {
            reject("INVALID_PAYLOAD", "uploadId/fileUri/uploadUrl/fileSize are required", nil)
            return
        }

        stateQueue.async { [weak self] in
            guard let self else { return }

            let state: UploadState
            if let existing = self.states[uploadId] {
                existing.payload   = payload
                existing.cancelled = false
                existing.paused    = false
                state = existing
            } else {
                let s = UploadState(uploadId: uploadId, payload: payload)
                s.uploadedBytes  = (payload["uploadedBytes"] as? NSNumber)?.int64Value ?? 0
                s.lastChunkIndex = (payload["lastChunkIndex"] as? Int) ?? 0
                self.states[uploadId] = s
                state = s
            }

            state.status  = "uploading"
            state.session = self.makeSession(for: uploadId)

            // Run file I/O outside stateQueue
            DispatchQueue.global(qos: .utility).async { [weak self] in
                self?.startChunk(state.lastChunkIndex, state: state)
            }
        }

        resolve(["uploadId": uploadId, "status": "uploading", "fileSize": fileSize])
    }

    @objc func pauseUpload(_ uploadId: String,
                            resolve: @escaping RCTPromiseResolveBlock,
                            reject: @escaping RCTPromiseRejectBlock) {
        stateQueue.async { [weak self] in
            guard let state = self?.states[uploadId] else {
                reject("NOT_FOUND", "Upload not found: \(uploadId)", nil); return
            }
            state.paused = true
            state.status = "paused"
            state.currentTask?.cancel()
            state.currentTask = nil
            resolve(nil)
        }
    }

    @objc func resumeUpload(_ uploadId: String,
                             resolve: @escaping RCTPromiseResolveBlock,
                             reject: @escaping RCTPromiseRejectBlock) {
        stateQueue.async { [weak self] in
            guard let self, let state = self.states[uploadId] else {
                reject("NOT_FOUND", "Upload not found: \(uploadId)", nil); return
            }
            state.paused    = false
            state.cancelled = false
            state.status    = "uploading"
            if state.session == nil {
                state.session = self.makeSession(for: uploadId)
            }
            DispatchQueue.global(qos: .utility).async { [weak self] in
                self?.startChunk(state.lastChunkIndex, state: state)
            }
            resolve(nil)
        }
    }

    @objc func cancelUpload(_ uploadId: String,
                             resolve: @escaping RCTPromiseResolveBlock,
                             reject: @escaping RCTPromiseRejectBlock) {
        stateQueue.async { [weak self] in
            guard let self, let state = self.states.removeValue(forKey: uploadId) else {
                reject("NOT_FOUND", "Upload not found: \(uploadId)", nil); return
            }
            state.cancelled = true
            state.status    = "cancelled"
            state.currentTask?.cancel()
            state.currentTask = nil
            state.session?.invalidateAndCancel()
            state.session = nil
            resolve(nil)
        }
    }

    // MARK: - URLSessionTaskDelegate

    /// Callback for when a background session chunk transfer completes.
    /// Results are handled through this delegate instead of a completionHandler block (required for background sessions).
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let taskId = task.taskIdentifier

        stateQueue.async { [weak self] in
            guard let self else { return }

            guard let ctx = self.contexts.removeValue(forKey: taskId) else { return }

            guard let state = self.states[ctx.uploadId] else {
                self.deleteTempChunkFile(ctx.tempFileURL); return
            }

            // Intentional pause / cancel
            if state.cancelled {
                self.deleteTempChunkFile(ctx.tempFileURL); return
            }
            if state.paused {
                self.deleteTempChunkFile(ctx.tempFileURL)
                self.emitState(state,
                               progress: Double(state.uploadedBytes) / Double(max(ctx.totalBytes, 1)),
                               totalBytes: ctx.totalBytes)
                return
            }

            let statusCode = (task.response as? HTTPURLResponse)?.statusCode ?? 0
            let success = error == nil && (200...299).contains(statusCode)

            if success {
                // Chunk succeeded → start the next chunk
                self.deleteTempChunkFile(ctx.tempFileURL)
                state.lastChunkIndex = ctx.chunkIndex + 1
                state.uploadedBytes  = min(ctx.totalBytes, state.uploadedBytes + Int64(ctx.length))
                state.retryAttempt   = 0
                let progress = Double(state.uploadedBytes) / Double(max(ctx.totalBytes, 1))
                self.emitState(state, progress: progress, totalBytes: ctx.totalBytes)

                if state.lastChunkIndex >= ctx.totalChunks {
                    // Upload complete
                    state.status = "completed"
                    self.emitState(state, progress: 1.0, totalBytes: ctx.totalBytes)
                    state.session?.finishTasksAndInvalidate()
                    state.session = nil
                    self.states.removeValue(forKey: state.uploadId)
                } else {
                    // Start the next chunk (file I/O outside stateQueue)
                    DispatchQueue.global(qos: .utility).async { [weak self] in
                        self?.startChunk(state.lastChunkIndex, state: state)
                    }
                }

            } else {
                // Failed → decide whether to retry
                let retryable = self.isRetryable(error: error, statusCode: statusCode)
                let maxRetries = 2

                if retryable && ctx.retryAttempt < maxRetries {
                    let nextAttempt = ctx.retryAttempt + 1
                    ctx.retryAttempt   = nextAttempt
                    state.retryAttempt = nextAttempt
                    let delay = self.backoffSeconds(attempt: nextAttempt)

                    self.emitState(state,
                                   progress: Double(state.uploadedBytes) / Double(max(ctx.totalBytes, 1)),
                                   totalBytes: ctx.totalBytes,
                                   errorMessage: "Retrying chunk \(ctx.chunkIndex + 1)/\(ctx.totalChunks) (attempt \(nextAttempt + 1)/\(maxRetries + 1))...")

                    // Resend using the same temp file after the backoff delay
                    DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + delay) { [weak self] in
                        guard let self else { return }
                        self.stateQueue.async {
                            if !state.cancelled, !state.paused {
                                self.submitChunk(ctx: ctx, state: state)
                            } else {
                                self.deleteTempChunkFile(ctx.tempFileURL)
                            }
                        }
                    }
                } else {
                    // Final failure
                    self.deleteTempChunkFile(ctx.tempFileURL)
                    let errMsg = error?.localizedDescription ?? "Server error: \(statusCode)"
                    state.status = "failed"
                    self.emitState(state,
                                   progress: Double(state.uploadedBytes) / Double(max(ctx.totalBytes, 1)),
                                   totalBytes: ctx.totalBytes,
                                   errorMessage: errMsg)
                    state.session?.invalidateAndCancel()
                    state.session = nil
                    self.states.removeValue(forKey: state.uploadId)
                }
            }
        }
    }

    // MARK: - URLSessionDelegate

    /// Called by iOS once all background URLSession events have finished processing.
    /// The completionHandler received from AppDelegate must be called on the main thread,
    /// otherwise iOS won't be able to suspend the app again.
    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        guard let identifier = session.configuration.identifier else { return }
        stateQueue.async { [weak self] in
            guard let handler = self?.backgroundHandlers.removeValue(forKey: identifier) else { return }
            DispatchQueue.main.async { handler() }
        }
    }
}
