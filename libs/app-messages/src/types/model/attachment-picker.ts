// --- Attachment Picker Types ---
//
// Videos and documents for a chat message, picked and kept by the shell. Their bytes never cross the
// bridge: a 300MB video would arrive as one 400MB base64 message. The shell copies what was picked
// into a folder of its own (`attach-pick`) and answers with each copy's `file://` URI and details; the
// web uploads from that URI with `StartFileTransfer`, which only accepts upload sources inside the
// shell's own folders. Photos picked here do cross, as base64, prepared the way the in-app photo grid
// prepares them (location removed, HEIC written as JPEG), because the web prepares every photo itself.
//
// The web ships before the app: a shell without these handlers answers `NOT_FOUND`, and the web then
// opens its own file input instead and learns not to ask again for the page's life.

/** Which picker to open: the photo and video library, or the documents picker. */
export type AttachmentPickSource = 'media' | 'document';

/** Per-kind size ceilings, the server's own. The shell copies nothing over them. */
export type AttachmentMaxBytes = {
    image: number;
    video: number;
    file: number;
};

/**
 * [Request] Open the OS picker for a chat attachment.
 *
 * - `media`: iOS `PHPickerViewController` (images and videos, the asset's current representation);
 *   Android Photo Picker (images and videos, no permission), falling back to the documents picker on
 *   devices without one.
 * - `document`: the documents picker, filtered to the server's seven document formats.
 *
 * The reply arrives when the picker closes and every picked file has been copied, which can be
 * minutes after the request; a caller must wait longer than its default request timeout.
 */
export type PickAttachmentsPayload = {
    source: AttachmentPickSource;
    /** How many more items the message may take — what is left of ten. */
    selectionLimit: number;
    maxBytes: AttachmentMaxBytes;
};

/** A picked photo: its prepared bytes, as the in-app grid hands one over. */
export type PickedImageAttachment = {
    kind: 'image';
    base64: string;
    mimeType: string;
    fileName: string;
    width: number;
    height: number;
};

/** A picked video or document: a copy the shell keeps in its `attach-pick` folder. */
export type PickedShellAttachment = {
    kind: 'video' | 'file';
    /** `file://` inside the shell's `attach-pick` folder. */
    uri: string;
    /**
     * The file's own name. A name the OS made up from a media id (Android's Photo Picker gives
     * `1000000123.mp4`) is replaced with `video-<yyyyMMdd-HHmmss>.mp4` or `photo-…`, by the capture
     * time or else the pick time. An extension the format does not match is left for the web to judge.
     */
    name: string;
    /** As the OS declared it; `application/octet-stream` when it does not know the format (HWP). */
    contentType: string;
    size: number;
    /**
     * iOS: the video is not yet an H.264 `mp4` of 1080p or less, so `PrepareVideo` converts it. Its
     * `name`, `contentType` and `size` are the source's (`IMG_0001.MOV`, `video/quicktime`) until then,
     * and the shell does not hold it to the video size limit: the conversion decides its size.
     */
    needsExport?: boolean;
};

export type PickedAttachment = PickedImageAttachment | PickedShellAttachment;

/** Why the shell did not copy a picked item. */
export type AttachmentRefusalReason = 'too-large' | 'unsupported' | 'unreadable';

/** [Response] What was picked, in pick order. A cancelled picker is `items: []`, not an error. */
export type OnPickAttachmentsPayload = {
    items: PickedAttachment[];
    /** Items the shell would not copy, in pick order. The web reports them as it reports its own refusals. */
    refused: { name: string; reason: AttachmentRefusalReason }[];
};

/**
 * The error codes `PrepareVideo` fails with.
 * - `TOO_LARGE`: still over the video limit after stepping down from 1080p to 720p.
 * - `UNSUPPORTED`: Android — not an `mp4` of H.264 video with AAC or no audio. The shell does not convert.
 * - `SOURCE`: the picked file is gone (the shell cleared its folder, or the OS cleared the cache).
 * - `SYSTEM`: the conversion failed — on iOS also when the app went to the background mid-way.
 * - `INVALID`: a missing field, or a URI outside the shell's `attach-pick` folder.
 */
export type PrepareVideoErrorCode = 'TOO_LARGE' | 'UNSUPPORTED' | 'SOURCE' | 'SYSTEM' | 'INVALID';

/**
 * [Request] Make a picked video ready to upload: written as an H.264/AAC `mp4` with its index first
 * (iOS converts what needs it; Android checks and sends as it is), and a poster frame beside it.
 *
 * Called for every shell video, converted or not, since the poster is made here. A conversion can take
 * minutes; the web waits up to ten, and treats running out as a failure of that video only.
 */
export type PrepareVideoPayload = {
    /** A `PickedShellAttachment.uri`. */
    uri: string;
};

/** [Response] The file to upload, and its poster when one could be made. Both are inside `attach-pick`. */
export type OnPrepareVideoPayload = {
    file: {
        uri: string;
        /** The picked name with its extension changed to `.mp4`. */
        name: string;
        contentType: 'video/mp4';
        size: number;
        width: number;
        height: number;
    };
    /**
     * A JPEG of the frame at 0.5s (or the first, for a shorter video), 400px on its long side and at
     * most 200KB. `base64` is a copy of the same bytes, for the web's preview while the video is sent:
     * the page cannot read a `file://` URI. `null` when no frame could be read.
     */
    poster: {
        uri: string;
        base64: string;
        contentType: 'image/jpeg';
        size: number;
        width: number;
        height: number;
    } | null;
};
