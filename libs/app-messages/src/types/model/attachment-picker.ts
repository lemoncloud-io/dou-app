// --- Attachment Picker Types ---
//
// Videos and documents for a chat message, picked and kept by the shell. Their bytes never cross the
// bridge: a 300MB video would arrive as one 400MB base64 message. The shell copies what was picked
// into a folder of its own (`attach-pick`) and answers with each copy's `file://` URI and details; the
// web uploads from that URI with `StartFileTransfer`, which only accepts upload sources inside the
// shell's own folders. A photo is kept there too, prepared the way the in-app photo grid prepares one
// (location removed, HEIC written as JPEG), and its bytes cross one photo at a time with `ReadAttachment`:
// the web prepares every photo itself, and ten photos in one answer would be some 200MB of base64.
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
 * - `document`: the documents picker, filtered to every format the server takes — its four photo
 *   formats, MP4 and its seven document formats. Every item it returns is a `file`, under the type the
 *   OS gave it; the web tells a photo or a video among them by its format.
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

/**
 * The error codes `PickAttachments` fails with. A cancelled picker is not one of them.
 * - `BUSY`: a picker is already open.
 * - `INVALID`: a missing or malformed field.
 * - `INTERNAL`: no screen to present the picker on, or anything else.
 */
export type PickAttachmentsErrorCode = 'BUSY' | 'INVALID' | 'INTERNAL';

/**
 * A picked photo, prepared and kept in the shell's `attach-pick` folder. Its bytes are read with
 * `ReadAttachment`, one photo at a time.
 */
export type PickedImageAttachment = {
    kind: 'image';
    /** `file://` inside the shell's `attach-pick` folder. */
    uri: string;
    name: string;
    /** The prepared photo's type, one the server takes. */
    contentType: string;
    size: number;
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

/** A picked item the shell did not copy. */
export type RefusedAttachment = {
    name: string;
    /** What the item was, so the web names the right limit. */
    kind: 'image' | 'video' | 'file';
    reason: AttachmentRefusalReason;
};

/** [Response] What was picked, in pick order. A cancelled picker is `items: []`, not an error. */
export type OnPickAttachmentsPayload = {
    items: PickedAttachment[];
    /** Items the shell would not copy, in pick order. The web reports them as it reports its own refusals. */
    refused: RefusedAttachment[];
};

/**
 * [Request] The bytes of one picked photo. The web asks for one at a time, in pick order, so at most
 * one photo is ever on the bridge. It ships in the same build as `PickAttachments`, so an app that
 * answers a pick answers this too.
 *
 * Fails with `INVALID` for a missing URI or one outside the shell's `attach-pick` folder, `SOURCE` when
 * the copy is gone, and `INTERNAL` otherwise. The web refuses that photo alone, as `unreadable`.
 */
export type ReadAttachmentPayload = {
    /** A `PickedImageAttachment.uri`. */
    uri: string;
};

/** [Response] The prepared photo, in the shape `ReadPhoto` answers. */
export type OnReadAttachmentPayload = {
    base64: string;
    mimeType: string;
    fileName: string;
    width: number;
    height: number;
};

/** The error codes `ReadAttachment` fails with. */
export type ReadAttachmentErrorCode = 'INVALID' | 'SOURCE' | 'INTERNAL';

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

/**
 * [Request] A JPEG of one frame of a received video, made by the shell from its signed address — the
 * tile of a video sent without a poster. The shell reads the remote file itself (a ranged read for
 * iOS `AVAssetImageGenerator`, Android `MediaMetadataRetriever`), so it needs no CORS on the bucket,
 * and the app's WebView, which loads no media before a tap, is never asked to.
 *
 * The frame follows the poster's rule: `atMs` in (the first frame of a shorter video), `maxEdge` on
 * the long side and never upscaled, JPEG from quality 0.7 down until it fits 200,000 bytes. Nothing
 * is written to disk. The shell runs at most two at once and gives up on one after 20 seconds; the web
 * waits 25, so the shell's own answer settles each. A shell from before this message answers
 * `NOT_FOUND`.
 */
export type ReadVideoFramePayload = {
    /** The video's signed `https:` address. */
    url: string;
    /** Where the frame is taken. The web sends 500. */
    atMs: number;
    /** The frame's long edge, in pixels. The web sends 400. */
    maxEdge: number;
};

/** [Response] The frame. */
export type OnReadVideoFramePayload = {
    base64: string;
    contentType: 'image/jpeg';
    width: number;
    height: number;
};

/**
 * The error codes `ReadVideoFrame` fails with.
 * - `INVALID`: the address is not `https:`, or a number is missing.
 * - `UNREADABLE`: no frame — the network, an expired address (403), a codec the device cannot decode.
 */
export type ReadVideoFrameErrorCode = 'INVALID' | 'UNREADABLE';
