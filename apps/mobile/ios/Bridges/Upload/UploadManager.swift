import Foundation

// MARK: - UploadChunkContext

/// 단일 청크 업로드 작업 컨텍스트.
/// URLSessionTaskDelegate 콜백에서 어느 uploadId의 몇 번째 청크인지 식별하기 위해 사용.
final class UploadChunkContext {
    let uploadId: String
    let chunkIndex: Int
    let totalChunks: Int
    let offset: Int64
    let length: Int
    let totalBytes: Int64
    /// 현재 재시도 횟수 (0-based, 최대 2회 재시도 = 총 3회 시도)
    var retryAttempt: Int = 0
    /// multipart body가 기록된 임시 파일 URL (재시도 시 재사용)
    var tempFileURL: URL?
    /// multipart boundary (재시도 시 동일 boundary 재사용)
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

/// 업로드 태스크 상태 컨테이너.
final class UploadState {
    let uploadId: String
    var payload: [String: Any]
    var status: String = "queued"
    var uploadedBytes: Int64 = 0
    var lastChunkIndex: Int = 0
    var retryAttempt: Int = 0
    var paused: Bool = false
    var cancelled: Bool = false
    /// uploadId당 하나의 background URLSession
    var session: URLSession?
    /// 현재 진행 중인 URLSessionTask (pause/cancel 시 참조)
    weak var currentTask: URLSessionTask?

    init(uploadId: String, payload: [String: Any]) {
        self.uploadId = uploadId
        self.payload = payload
    }
}

// MARK: - UploadManager

/// iOS Native 청크 업로드 엔진.
///
/// 구조:
/// - URLSession Background Configuration — 앱이 홈으로 내려가도 OS가 전송을 이어받음
/// - 청크당 임시 파일 생성 후 `uploadTask(with:fromFile:)` 사용 (file-based, completionHandler 없음)
/// - background session은 completionHandler 블록 불가 → URLSessionTaskDelegate로 결과 처리
/// - 청크 완료 시 delegate에서 다음 청크를 연쇄 시작하는 이벤트 드리븐 구조
///
/// ⚠️ localhost 테스트 주의:
/// background URLSession은 `nsurlsessiond` 데몬을 통해 전송되므로
/// 시뮬레이터에서 localhost로 테스트 시 연결이 안 될 수 있습니다.
/// 실제 IP(예: 192.168.x.x)를 사용하거나 실기기에서 테스트하세요.
@objc(UploadManager)
final class UploadManager: RCTEventEmitter, URLSessionTaskDelegate {

    // MARK: - State

    /// 모든 상태 변경을 직렬화하는 큐 (스레드 안전)
    private let stateQueue = DispatchQueue(label: "io.chatic.dou.upload.state", qos: .utility)
    private var states: [String: UploadState] = [:]
    /// NSURLSessionTask.taskIdentifier → UploadChunkContext
    private var contexts: [Int: UploadChunkContext] = [:]
    /// background session 완료 시 AppDelegate에서 전달받은 completionHandler
    private var backgroundHandlers: [String: () -> Void] = [:]
    private var hasListeners = false

    // MARK: - RCTEventEmitter

    @objc override static func requiresMainQueueSetup() -> Bool { false }

    override func supportedEvents() -> [String]! { ["UploadManagerStateChanged"] }

    override func startObserving() { hasListeners = true }
    override func stopObserving()  { hasListeners = false }

    // MARK: - AppDelegate 연동

    /// iOS가 background URLSession 완료 후 앱을 깨울 때 AppDelegate에서 호출.
    /// `urlSessionDidFinishEvents(forBackgroundURLSession:)` 에서 처리.
    @objc func handleBackgroundSession(_ identifier: String, completionHandler: @escaping () -> Void) {
        stateQueue.async { [weak self] in
            self?.backgroundHandlers[identifier] = completionHandler
        }
    }

    // MARK: - 이벤트 발행

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

    // MARK: - 파일 I/O 헬퍼

    /// 파일에서 특정 offset/length 만큼 binary 읽기
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

    /// multipart body를 임시 파일에 저장 (background session은 file-based 전송만 지원)
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

    // MARK: - Multipart 빌더

    /// multipart/form-data body 조립 (binary, base64 아님)
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

    /// 청크 업로드 URLRequest 생성 (헤더만, HTTPBody 없음)
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

    // MARK: - 백오프 / 재시도

    private func backoffSeconds(attempt: Int) -> TimeInterval {
        return min(0.5 * pow(2.0, Double(attempt - 1)), 5.0) // 0.5s, 1s, 2s, max 5s
    }

    private func isRetryable(error: Error?, statusCode: Int) -> Bool {
        if let e = error as NSError?, e.code == NSURLErrorCancelled { return false }
        return error != nil || (statusCode >= 500 && statusCode <= 599)
    }

    // MARK: - 청크 시작 (이벤트 드리븐 핵심)

    /// 지정한 chunkIndex의 청크를 읽어 임시 파일로 기록하고 URLSession upload task를 생성·시작.
    /// - 이 메서드는 stateQueue 위에서 호출하면 안 됩니다 (파일 I/O 블로킹).
    private func startChunk(_ chunkIndex: Int, state: UploadState) {
        guard !state.cancelled, !state.paused else { return }

        let payload = state.payload
        let fileUri   = payload["fileUri"] as? String ?? ""
        let totalBytes = (payload["fileSize"] as? NSNumber)?.int64Value ?? 0
        let chunkSz   = max((payload["chunkSize"] as? Int) ?? (1024 * 1024), 1)
        let totalChunks = Int((totalBytes + Int64(chunkSz) - 1) / Int64(chunkSz))
        let offset    = Int64(chunkIndex) * Int64(chunkSz)
        let length    = Int(min(Int64(chunkSz), totalBytes - offset))

        // 청크 바이너리 읽기
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

        // multipart body → 임시 파일
        let body = buildMultipartBody(chunkData: chunkData, boundary: boundary, chunkIndex: chunkIndex)
        ctx.tempFileURL = writeChunkToTempFile(body, uploadId: state.uploadId, chunkIndex: chunkIndex)

        stateQueue.async { [weak self] in
            self?.submitChunk(ctx: ctx, state: state)
        }
    }

    /// 컨텍스트를 기반으로 URLSession upload task 생성·등록·시작.
    /// ⚠️ stateQueue에서 호출해야 합니다.
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

        // ✅ completionHandler 없는 file-based upload task (background session 필수 조건)
        let task = session.uploadTask(with: request, fromFile: tempURL)
        state.currentTask = task
        state.retryAttempt = ctx.retryAttempt
        contexts[task.taskIdentifier] = ctx
        task.resume()
    }

    // MARK: - Background URLSession 생성 헬퍼

    private func makeSession(for uploadId: String) -> URLSession {
        let sessionId = "io.chatic.dou.upload.\(uploadId)"
        let config = URLSessionConfiguration.background(withIdentifier: sessionId)
        config.isDiscretionary = false          // 사용자 요청이므로 즉시 실행
        config.sessionSendsLaunchEvents = true  // 완료 시 앱 깨우기 허용
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

            // 파일 I/O는 stateQueue 밖에서 실행
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

    /// background session 청크 전송 완료 콜백.
    /// completionHandler 블록 대신 이 delegate로 결과를 처리 (background session 필수 구조).
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        let taskId = task.taskIdentifier

        stateQueue.async { [weak self] in
            guard let self else { return }

            guard let ctx = self.contexts.removeValue(forKey: taskId) else { return }

            guard let state = self.states[ctx.uploadId] else {
                self.deleteTempChunkFile(ctx.tempFileURL); return
            }

            // 의도적 pause / cancel
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
                // ✅ 청크 성공 → 다음 청크 시작
                self.deleteTempChunkFile(ctx.tempFileURL)
                state.lastChunkIndex = ctx.chunkIndex + 1
                state.uploadedBytes  = min(ctx.totalBytes, state.uploadedBytes + Int64(ctx.length))
                state.retryAttempt   = 0
                let progress = Double(state.uploadedBytes) / Double(max(ctx.totalBytes, 1))
                self.emitState(state, progress: progress, totalBytes: ctx.totalBytes)

                if state.lastChunkIndex >= ctx.totalChunks {
                    // 🎉 업로드 완료
                    state.status = "completed"
                    self.emitState(state, progress: 1.0, totalBytes: ctx.totalBytes)
                    state.session?.finishTasksAndInvalidate()
                    state.session = nil
                    self.states.removeValue(forKey: state.uploadId)
                } else {
                    // 다음 청크 (파일 I/O는 stateQueue 밖에서)
                    DispatchQueue.global(qos: .utility).async { [weak self] in
                        self?.startChunk(state.lastChunkIndex, state: state)
                    }
                }

            } else {
                // ❌ 실패 → 재시도 판단
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

                    // 백오프 후 동일 임시 파일로 재전송
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
                    // 최종 실패
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

    /// background URLSession 모든 이벤트 처리 완료 시 iOS가 호출.
    /// AppDelegate에서 전달받은 completionHandler를 반드시 main thread에서 호출해야
    /// iOS가 앱을 다시 suspend할 수 있음.
    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        guard let identifier = session.configuration.identifier else { return }
        stateQueue.async { [weak self] in
            guard let handler = self?.backgroundHandlers.removeValue(forKey: identifier) else { return }
            DispatchQueue.main.async { handler() }
        }
    }
}
