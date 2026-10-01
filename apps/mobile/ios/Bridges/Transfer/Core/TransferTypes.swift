import Foundation

/// Which way the bytes move. A download writes into a folder the shell owns (`DownloadFiles`).
enum TransferDirection: String {
    case upload
    case download
}

/// Lifecycle of one transfer. `running` repeats; the other three are terminal and each transfer
/// reaches exactly one of them.
enum TransferState: String {
    case running
    case responded
    case failed
    case cancelled

    var isTerminal: Bool { self != .running }
}

/// Error codes shared with the JS contract. The raw value is what crosses the bridge, both as a
/// `failed` event's `errorCode` and as a promise rejection code.
enum TransferErrorCode: String {
    case network = "NETWORK"
    case source = "SOURCE"
    case invalid = "INVALID"
    case system = "SYSTEM"
    case `internal` = "INTERNAL"
}

/// A rejected call. The OS layer turns it into a promise rejection with `code.rawValue`.
struct TransferError: Error, Equatable {
    let code: TransferErrorCode
    let message: String
}

/// A start request as the web sent it. Fields keep their raw form so validation (in `TransferCore`)
/// decides what is acceptable, not the parsing step.
struct TransferRequest {
    let transferId: String
    let direction: String
    let url: String
    let method: String
    let headers: [String: String]
    let fileUri: String
    let contentType: String?
    let contentLength: Int64?
    let title: String?
    /// `download` only: the file name hint (`file.name`). Where the file goes is the shell's choice.
    let fileName: String?

    /// Reads the bridge dictionary. Missing or mistyped fields become empty values and are rejected
    /// by validation, so a malformed request always ends as `INVALID` rather than a crash.
    init(dictionary: [String: Any]) {
        transferId = dictionary["transferId"] as? String ?? ""
        direction = dictionary["direction"] as? String ?? ""
        url = dictionary["url"] as? String ?? ""
        method = dictionary["method"] as? String ?? ""
        var parsedHeaders: [String: String] = [:]
        if let raw = dictionary["headers"] as? [String: Any] {
            for (name, value) in raw {
                if let text = value as? String {
                    parsedHeaders[name] = text
                } else if let number = value as? NSNumber {
                    parsedHeaders[name] = number.stringValue
                }
            }
        }
        headers = parsedHeaders
        let file = dictionary["file"] as? [String: Any] ?? [:]
        fileUri = file["uri"] as? String ?? ""
        contentType = file["contentType"] as? String
        if let number = file["contentLength"] as? NSNumber {
            contentLength = number.int64Value
        } else {
            contentLength = nil
        }
        title = dictionary["title"] as? String
        fileName = file["name"] as? String
    }

    init(
        transferId: String,
        direction: String,
        url: String,
        method: String,
        headers: [String: String] = [:],
        fileUri: String,
        contentType: String? = nil,
        contentLength: Int64?,
        title: String? = nil,
        fileName: String? = nil
    ) {
        self.transferId = transferId
        self.direction = direction
        self.url = url
        self.method = method
        self.headers = headers
        self.fileUri = fileUri
        self.contentType = contentType
        self.contentLength = contentLength
        self.title = title
        self.fileName = fileName
    }
}

/// The file a download wrote, as the bridge payload `DownloadedFile` carries it.
struct DownloadedFile: Equatable {
    /// `file://` URI inside the download folder.
    let uri: String
    let size: Int64
    /// The response's `Content-Type`, passed through unjudged.
    let contentType: String?

    var dictionary: [String: Any] {
        var payload: [String: Any] = ["uri": uri, "size": NSNumber(value: size)]
        if let contentType { payload["contentType"] = contentType }
        return payload
    }
}

/// The state of one transfer as the bridge sees it (`OnFileTransferStatePayload`).
struct TransferSnapshot: Equatable {
    let transferId: String
    let direction: TransferDirection
    let state: TransferState
    let transferredBytes: Int64
    let totalBytes: Int64
    let httpStatus: Int?
    let providerCode: String?
    let errorCode: TransferErrorCode?
    let errorMessage: String?
    /// Not part of the bridge payload; the OS layer uses it for notification text.
    let title: String?
    /// A committed download's file; only on a download that ended `responded` with a 2xx status.
    var file: DownloadedFile? = nil

    /// Bridge payload. Optional fields are left out rather than sent as null, matching the
    /// optional-property shape of the TypeScript type.
    var dictionary: [String: Any] {
        var payload: [String: Any] = [
            "transferId": transferId,
            "direction": direction.rawValue,
            "state": state.rawValue,
            "transferredBytes": NSNumber(value: transferredBytes),
            "totalBytes": NSNumber(value: totalBytes),
        ]
        if let httpStatus { payload["httpStatus"] = NSNumber(value: httpStatus) }
        if let providerCode { payload["providerCode"] = providerCode }
        if let errorCode { payload["errorCode"] = errorCode.rawValue }
        if let errorMessage { payload["errorMessage"] = errorMessage }
        if let file { payload["file"] = file.dictionary }
        return payload
    }
}

/// Byte-weighted progress of the current batch, for the system progress UI only. It never
/// crosses the bridge: the web computes its own ratios from bytes.
struct TransferBatchAggregate: Equatable {
    let memberCount: Int
    let runningCount: Int
    let countedBytes: Int64
    let totalBytes: Int64
    /// `nil` when any member has an unknown total (0), so the UI shows an indeterminate bar.
    let ratio: Double?
    let anyFailed: Bool
    /// The title when the batch has exactly one member, for a single-file subtitle.
    let singleTitle: String?
}

/// What the failure notification of a finished batch says. The OS layer announces each
/// `batchSequence` at most once.
struct TransferFailureNotice: Equatable {
    let batchSequence: Int
    let failedCount: Int
    let memberCount: Int
    /// The title when the batch has exactly one member.
    let singleTitle: String?
}
