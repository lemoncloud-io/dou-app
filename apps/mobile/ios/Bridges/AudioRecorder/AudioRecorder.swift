import AVFoundation
import Foundation
import React
import UIKit

/// AudioRecorder — records a voice message, from the tap on the recording sheet to Send or Cancel.
///
/// The recording is written with `AVAudioRecorder` straight into a pick folder of its own,
/// `Caches/attach-pick/<uuid>/voice-yyyyMMdd-HHmmss.m4a`, and answered with the same `file` reference a
/// document pick gives: the transfer uploads it from there (`TransferSessionOwner.uploadRoots`), and the
/// picker's 24-hour sweep deletes it afterwards. Its bytes never cross the bridge.
///
/// The microphone permission is the web's handler's to ask for; this only checks it, and never
/// prompts. The audio session is the app's own, shared with the WebView's video playback, so it is
/// switched to recording only while a recording runs: its category, mode and options are kept at the
/// start and put back, the session deactivated so other apps' audio resumes, whichever way the
/// recording ends.
///
/// A recording ends once. `stop` ends it as asked; the shell ends it by itself — and pushes
/// `AudioRecorderEnded` — at its limit, on an interruption (a call, Siri, the app leaving the
/// foreground), or when the recorder fails. Whichever comes first is the end; the other finds nothing
/// recording.
///
/// The rules that need no UIKit or AVFoundation live in `Core/AudioRecorderCore.swift`.
@objc(AudioRecorder)
final class AudioRecorder: RCTEventEmitter, AVAudioRecorderDelegate {
    private static let endedEvent = "AudioRecorderEnded"

    private static let settings: [String: Any] = [
        AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
        AVNumberOfChannelsKey: AudioRecorderCore.channels,
        AVSampleRateKey: AudioRecorderCore.sampleRate,
        AVEncoderBitRateKey: AudioRecorderCore.bitRate,
    ]

    /// Every call, recorder callback and notification lands here, one at a time, so a stop and an
    /// interruption arriving together cannot both end the same recording. Nothing below is touched
    /// anywhere else.
    private let queue = DispatchQueue(label: "io.chatic.dou.audio-recorder", qos: .userInitiated)
    private var listening = false
    private var current: Recording?

    /// The audio session as it was before a recording took it over.
    private struct SavedSession {
        let category: AVAudioSession.Category
        let mode: AVAudioSession.Mode
        let options: AVAudioSession.CategoryOptions
    }

    /// The running recording.
    private final class Recording {
        let recorder: AVAudioRecorder
        let file: URL
        let maxDurationMs: Int64
        let session: SavedSession
        /// System uptime at the start: the elapsed time must not move with the wall clock.
        let startUptime: TimeInterval
        var observers: [NSObjectProtocol] = []

        init(recorder: AVAudioRecorder, file: URL, maxDurationMs: Int64, session: SavedSession) {
            self.recorder = recorder
            self.file = file
            self.maxDurationMs = maxDurationMs
            self.session = session
            startUptime = ProcessInfo.processInfo.systemUptime
        }

        var elapsedMs: Int64 { Int64(((ProcessInfo.processInfo.systemUptime - startUptime) * 1000).rounded()) }
    }

    @objc override static func requiresMainQueueSetup() -> Bool { false }

    override func supportedEvents() -> [String]! { [Self.endedEvent] }

    override func startObserving() {
        queue.async { self.listening = true }
    }

    override func stopObserving() {
        queue.async { self.listening = false }
    }

    /// A bridge reload: the page that asked for the recording is gone, so it is discarded unreported.
    override func invalidate() {
        queue.async {
            self.listening = false
            if let recording = self.current { _ = self.end(recording, .cancelled) }
        }
        super.invalidate()
    }

    // MARK: - Start

    @objc(start:resolve:reject:)
    func start(_ maxDurationMs: NSNumber?, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        let limit = AudioRecorderCore.clampedMaxDurationMs(maxDurationMs?.doubleValue)
        queue.async {
            guard self.current == nil else { return reject("BUSY", "a recording is already running", nil) }
            guard Self.permissionGranted() else {
                return reject("PERMISSION_DENIED", "microphone access is not granted", nil)
            }

            let audio = AVAudioSession.sharedInstance()
            let saved = SavedSession(category: audio.category, mode: audio.mode, options: audio.categoryOptions)
            do {
                try audio.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP])
                try audio.setActive(true)
            } catch {
                Self.restore(saved)
                return reject("INTERNAL", TransferText.sanitize("the audio session could not start: \(error.localizedDescription)"), nil)
            }

            let file = AudioRecorderCore.recordingFile(
                root: AttachmentPicker.root,
                folderId: UUID(),
                name: AudioRecorderCore.fileName(startedAt: Date())
            )
            let folder = file.deletingLastPathComponent()
            let recorder: AVAudioRecorder
            do {
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                recorder = try AVAudioRecorder(url: file, settings: Self.settings)
            } catch {
                try? FileManager.default.removeItem(at: folder)
                Self.restore(saved)
                return reject("INTERNAL", TransferText.sanitize("the recorder could not start: \(error.localizedDescription)"), nil)
            }
            recorder.delegate = self
            // The limit is the recorder's own: it stops there and says so through the delegate.
            guard recorder.prepareToRecord(), recorder.record(forDuration: TimeInterval(limit) / 1000) else {
                recorder.delegate = nil
                recorder.stop()
                try? FileManager.default.removeItem(at: folder)
                Self.restore(saved)
                return reject("INTERNAL", "the recorder could not start", nil)
            }
            let startedAt = Date()

            let recording = Recording(recorder: recorder, file: file, maxDurationMs: limit, session: saved)
            self.current = recording
            self.observeInterruptions(of: recording)
            resolve([
                "startedAt": NSNumber(value: Int64((startedAt.timeIntervalSince1970 * 1000).rounded())),
                "maxDurationMs": NSNumber(value: limit),
            ])

            // Someone who only ever sends voice messages never picks, so the picker's sweep runs here
            // too. The new folder is seconds old; only folders untouched for a day go.
            DispatchQueue.global(qos: .utility).async { AttachmentPicker.sweep() }
        }
    }

    // MARK: - Stop

    @objc(stop:resolve:reject:)
    func stop(_ action: NSString, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        queue.async {
            guard let action = AudioRecorderCore.StopAction(rawValue: action as String) else {
                return reject("INVALID", "action must be send or cancel", nil)
            }
            guard let recording = self.current else {
                return reject("NOT_RECORDING", "nothing is recording", nil)
            }
            let elapsedMs = recording.elapsedMs
            // Read before the stop, which resets it.
            let recordedSeconds = recording.recorder.currentTime
            let reason = AudioRecorderCore.endReason(for: action, elapsedMs: elapsedMs)
            resolve(self.end(recording, reason, recordedSeconds: recordedSeconds, elapsedMs: elapsedMs))
        }
    }

    // MARK: - Ending by itself

    func audioRecorderDidFinishRecording(_ recorder: AVAudioRecorder, successfully flag: Bool) {
        queue.async {
            // A recording `stop` ended has already left `current`, and its recorder no delegate.
            guard let recording = self.current, recording.recorder === recorder else { return }
            let reason = AudioRecorderCore.finishedReason(
                successfully: flag, elapsedMs: recording.elapsedMs, maxDurationMs: recording.maxDurationMs
            )
            // At the limit the recorder has recorded exactly that long.
            self.emit(self.end(recording, reason, recordedSeconds: Double(recording.maxDurationMs) / 1000))
        }
    }

    func audioRecorderEncodeErrorDidOccur(_ recorder: AVAudioRecorder, error: Error?) {
        queue.async {
            guard let recording = self.current, recording.recorder === recorder else { return }
            self.emit(self.end(recording, .failed))
        }
    }

    /// A call or Siri taking the audio (`.began`), the app leaving the foreground, or the media
    /// services restarting under the recorder all end the recording. Observed only while it runs.
    private func observeInterruptions(of recording: Recording) {
        let center = NotificationCenter.default
        let interrupt: (AudioRecorderCore.EndReason) -> (Notification) -> Void = { [weak self, weak recording] reason in
            { _ in self?.endFromOutside(recording, reason) }
        }
        recording.observers = [
            center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { [weak self, weak recording] note in
                guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                      AVAudioSession.InterruptionType(rawValue: raw) == .began
                else { return }
                self?.endFromOutside(recording, .interrupted)
            },
            center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: nil, using: interrupt(.interrupted)),
            center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: nil, using: interrupt(.interrupted)),
            center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: nil, using: interrupt(.failed)),
        ]
    }

    private func endFromOutside(_ recording: Recording?, _ reason: AudioRecorderCore.EndReason) {
        queue.async {
            guard let recording, self.current === recording else { return }
            self.emit(self.end(recording, reason))
        }
    }

    // MARK: - Internals

    /// Ends `recording` as `reason`: stops the recorder, gives the audio session back, and either keeps
    /// the file — answered as the wire's ended payload — or deletes its folder. A kept file that is
    /// not MPEG-4 is deleted and answered `INTERNAL`.
    private func end(
        _ recording: Recording,
        _ reason: AudioRecorderCore.EndReason,
        recordedSeconds: Double = 0,
        elapsedMs: Int64? = nil
    ) -> [String: Any] {
        current = nil
        for observer in recording.observers {
            NotificationCenter.default.removeObserver(observer)
        }
        recording.observers = []
        // No delegate first: the stop must not come back as an end of its own.
        recording.recorder.delegate = nil
        recording.recorder.stop()
        Self.restore(recording.session)

        let fm = FileManager.default
        let folder = recording.file.deletingLastPathComponent()
        guard reason.keepsFile else {
            try? fm.removeItem(at: folder)
            return ["reason": reason.rawValue]
        }
        guard Self.isMpeg4(recording.file), let size = AttachmentPicker.fileSize(recording.file) else {
            try? fm.removeItem(at: folder)
            return ["reason": AudioRecorderCore.EndReason.failed.rawValue]
        }
        let durationMs = AudioRecorderCore.durationMs(
            recordedSeconds: recordedSeconds,
            elapsedMs: elapsedMs ?? recording.elapsedMs,
            maxDurationMs: recording.maxDurationMs
        )
        return [
            "reason": reason.rawValue,
            "file": [
                "kind": "file",
                "uri": recording.file.absoluteString,
                "name": recording.file.lastPathComponent,
                "contentType": AudioRecorderCore.contentType,
                "size": NSNumber(value: size),
            ],
            "durationMs": NSNumber(value: durationMs),
        ]
    }

    private func emit(_ body: [String: Any]) {
        guard listening else { return }
        sendEvent(withName: Self.endedEvent, body: body)
    }

    /// Puts the session back as it was: deactivated, telling other apps they may resume, then the
    /// category, mode and options from before. Either may fail — deactivating while the WebView still
    /// plays is refused — and the other is still done.
    private static func restore(_ saved: SavedSession) {
        let audio = AVAudioSession.sharedInstance()
        try? audio.setActive(false, options: .notifyOthersOnDeactivation)
        try? audio.setCategory(saved.category, mode: saved.mode, options: saved.options)
    }

    private static func permissionGranted() -> Bool {
        if #available(iOS 17.0, *) {
            return AVAudioApplication.shared.recordPermission == .granted
        }
        return AVAudioSession.sharedInstance().recordPermission == .granted
    }

    private static func isMpeg4(_ file: URL) -> Bool {
        guard let handle = try? FileHandle(forReadingFrom: file) else { return false }
        defer { try? handle.close() }
        return AudioRecorderCore.isMpeg4(handle.readData(ofLength: AudioRecorderCore.headerBytes))
    }
}
