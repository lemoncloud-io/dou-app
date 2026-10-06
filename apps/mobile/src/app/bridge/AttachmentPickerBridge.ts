import { NativeModules } from 'react-native';
import type {
    AttachmentMaxBytes,
    AttachmentPickSource,
    OnPickAttachmentsPayload,
    OnPrepareVideoPayload,
    OnReadAttachmentPayload,
    OnReadVideoFramePayload,
} from '@chatic/app-messages';

/**
 * AttachmentPicker — the OS pickers for a chat attachment, and the video preparation that follows
 * (Swift `AttachmentPicker`, Kotlin `AttachmentPickerModule`).
 *
 * Both calls answer with the wire payloads as they are, so the handler only relays. What was picked
 * is copied into the shell's `attach-pick` folder before `pick` resolves: the URI an OS picker hands
 * over stops being readable soon after (Android revokes the grant when the receiving screen closes,
 * iOS deletes its temporary copy once the callback returns), and the upload runs much later.
 *
 * A native build without the module — JS run over an older native build — has `isAvailable` false,
 * and the router then leaves its messages unregistered: the web gets `NOT_FOUND` and opens its own
 * file input instead. Answering with an error would take that fallback away. `readVideoFrame` came
 * later than the module, so it is judged by method: a build without it leaves `ReadVideoFrame`
 * unregistered.
 */
const { AttachmentPicker } = NativeModules;

const hasMethod = (name: string): boolean => typeof AttachmentPicker?.[name] === 'function';

export interface IAttachmentPickerBridge {
    /** Whether this build has the native module. */
    readonly isAvailable: boolean;
    /**
     * Opens the picker and resolves once it closed and every picked item was copied — minutes, for a
     * few large videos. A cancelled picker resolves with nothing picked. Rejects with `BUSY` while a
     * picker is already open, `INTERNAL` when there is no screen to present it on.
     */
    pick(
        source: AttachmentPickSource,
        selectionLimit: number,
        maxBytes: AttachmentMaxBytes
    ): Promise<OnPickAttachmentsPayload>;
    /**
     * Writes a picked video as an H.264 `mp4` (iOS converts when it has to; Android checks) and makes
     * its poster. Rejects with `TOO_LARGE`, `UNSUPPORTED`, `SOURCE`, `SYSTEM` or `INVALID`.
     */
    prepareVideo(uri: string): Promise<OnPrepareVideoPayload>;
    /**
     * The bytes of one picked photo, as base64. The web asks for one at a time. Rejects with
     * `INVALID` (outside `attach-pick`), `SOURCE` (the copy is gone) or `INTERNAL`.
     */
    readAttachment(uri: string): Promise<OnReadAttachmentPayload>;
    /** Whether this build can make a received video's frame (`readVideoFrame`). */
    readonly canReadVideoFrame: boolean;
    /**
     * A JPEG of the frame `atMs` into the remote video at `url`, `maxEdge` on its long side, read
     * straight from the address and kept nowhere. Rejects with `INVALID` or `UNREADABLE`.
     */
    readVideoFrame(url: string, atMs: number, maxEdge: number): Promise<OnReadVideoFramePayload>;
}

const unavailable = (): Promise<never> =>
    Promise.reject(Object.assign(new Error('AttachmentPicker native module is not available'), { code: 'INTERNAL' }));

export const AttachmentPickerBridge: IAttachmentPickerBridge = {
    isAvailable: !!AttachmentPicker,
    pick: (source, selectionLimit, maxBytes) =>
        AttachmentPicker ? AttachmentPicker.pick(source, selectionLimit, maxBytes) : unavailable(),
    prepareVideo: uri => (AttachmentPicker ? AttachmentPicker.prepareVideo(uri) : unavailable()),
    readAttachment: uri => (AttachmentPicker ? AttachmentPicker.readAttachment(uri) : unavailable()),
    canReadVideoFrame: hasMethod('readVideoFrame'),
    readVideoFrame: (url, atMs, maxEdge) =>
        hasMethod('readVideoFrame') ? AttachmentPicker.readVideoFrame(url, atMs, maxEdge) : unavailable(),
};
