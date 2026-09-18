import { isUploadStored } from 'lemon-model/upload';

import type { UploadView } from 'lemon-model/upload';

/**
 * Attachments on a chat message, carried inside `content`.
 *
 * The socket contract has no field for them: `chat.send` takes `channelId`, `content`,
 * `contentType`, `parentId`, `stereo`, `subType`, and `ChatView` gives nothing back beyond those.
 * Rather than block on a wire change, an attachment message puts a small manifest in `content` —
 * the same route Block Kit took before the server grew `blocks$`, and the same way out of it: when
 * a server field appears, the reader gains one branch ahead of this one and nothing else moves.
 *
 * The manifest carries `url` so a receiver draws the message without a second call (the contract
 * fixes upload urls as stable and public), and `id` so post-processing that lands later — a
 * thumbnail, pixel dimensions — can still be fetched by id.
 */

/**
 * Where a displayable upload url may point.
 *
 * A manifest is written by whoever sent the message and lands in an `<img src>`, so the scheme is
 * not a formality: `javascript:` and `data:` values have to be refused before a renderer sees them.
 * `apps/web` already guards webhook attachment links this way (`safeAttachmentUrl`) — same reason,
 * same rule, applied one layer earlier so every surface inherits it.
 */
const isDisplayableUrl = (url: string): boolean => {
    try {
        const { protocol } = new URL(url);
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        // Relative or malformed: there is nothing safe to resolve it against.
        return false;
    }
};

/**
 * The most attachments a single message will draw.
 *
 * The composer stops at ten, but a message is data from someone else's client — a manifest can
 * claim any number, and a list screen would dutifully build every tile. The cap is what keeps a
 * hostile or buggy sender from turning one row into thousands of image requests.
 */
export const MAX_RENDERED_UPLOADS = 10;

/** One stored upload, as a message carries it. */
export interface ChatUpload {
    id: string;
    name: string;
    url: string;
    contentType?: string;
    contentSize?: number;
    width?: number;
    height?: number;
}

/** A parsed attachment message: the text the sender typed, plus what they attached. */
export interface ChatUploadsContent {
    text: string;
    uploads: ChatUpload[];
}

/** Marks the message as carrying attachments of mixed types; a uniform batch reports its MIME. */
export const UPLOADS_CONTENT_TYPE = 'uploads';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/** A number the UI can lay out with: finite and positive, or absent. */
const asPositive = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

const asUpload = (value: unknown): ChatUpload | null => {
    if (!isRecord(value)) return null;
    const { id, name, url } = value;
    if (typeof id !== 'string' || !id) return null;
    if (typeof url !== 'string' || !isDisplayableUrl(url)) return null;
    return {
        id,
        name: typeof name === 'string' ? name : '',
        url,
        contentType: typeof value.contentType === 'string' ? value.contentType : undefined,
        contentSize: asPositive(value.contentSize),
        width: asPositive(value.width),
        height: asPositive(value.height),
    };
};

/**
 * Reads a manifest out of `content`, or null when there is not one.
 *
 * The judgement is on the CONTENT, never on `contentType`. A marker cannot be trusted here: the
 * domain mapper spreads whatever the server stamped, and the client's own send path defaults to
 * `'text'`, so a marker-based reader passes every test and then reports "no attachments" for every
 * message in production. Block Kit found that the expensive way.
 *
 * A message whose `uploads` array is present but empty is not an attachment message — the text
 * stands on its own, and an empty gallery is worse than none.
 */
export const parseChatUploadsContent = (content?: string): ChatUploadsContent | null => {
    const raw = content?.trim();
    if (!raw || raw[0] !== '{') return null;
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        // Not JSON, so it is an ordinary message that happens to start with a brace.
        return null;
    }
    if (!isRecord(parsed) || !Array.isArray(parsed.uploads)) return null;
    const uploads = parsed.uploads
        .slice(0, MAX_RENDERED_UPLOADS)
        .map(asUpload)
        .filter((upload): upload is ChatUpload => upload !== null);
    if (!uploads.length) return null;
    return { text: typeof parsed.text === 'string' ? parsed.text : '', uploads };
};

/** The attachments alone — the reading a message row needs. */
export const parseChatUploads = (content?: string): ChatUpload[] | null =>
    parseChatUploadsContent(content)?.uploads ?? null;

/** The text alone, so a row renders the message body without the manifest around it. */
export const chatContentText = (content?: string): string => parseChatUploadsContent(content)?.text ?? content ?? '';

/** Builds the `content` string for a send. Key order is fixed so two identical sends look identical. */
export const buildChatUploadsContent = (text: string, uploads: ChatUpload[]): string =>
    JSON.stringify({ text, uploads });

/**
 * What to stamp on `contentType`.
 *
 * The server model documents this field as a MIME type (`'text'`, `'image/jpeg'`, `'audio/mp3'`),
 * so a batch that is all one type reports that type; a mixed one reports the generic marker. No
 * reader depends on either value — this is a hint for whatever indexes messages later, which is why
 * getting it wrong cannot break the feature.
 */
export const chatUploadsContentType = (uploads: ChatUpload[]): string => {
    const types = uploads.map(upload => upload.contentType).filter((type): type is string => !!type);
    if (types.length !== uploads.length || !types.length) return UPLOADS_CONTENT_TYPE;
    return types.every(type => type === types[0]) ? types[0] : UPLOADS_CONTENT_TYPE;
};

/** What a one-line surface (home preview, notification, search, clipboard) needs to fold a message. */
export interface ChatContentSummary {
    /** The sender's text, empty when they attached without typing. */
    text: string;
    /** 0 for an ordinary message. */
    uploadCount: number;
    /** First attachment's file name — what a single-photo message shows when there is no text. */
    firstName?: string;
}

/**
 * Folds any message to the parts a one-line surface can render.
 *
 * Every such surface reads `content`, so without this they would all print raw JSON the day
 * attachments ship. The phrasing stays in the apps — "n photos" is a translated string, and this
 * layer holds no i18n.
 */
export const summarizeChatContent = (content?: string): ChatContentSummary => {
    const parsed = parseChatUploadsContent(content);
    if (!parsed) return { text: content ?? '', uploadCount: 0 };
    return { text: parsed.text, uploadCount: parsed.uploads.length, firstName: parsed.uploads[0]?.name || undefined };
};

/**
 * The manifest entries for a finished batch — the stored uploads, in the order they were picked.
 *
 * `isUploadStored` is the contract's own guard: it narrows to the shape where `id` and `url` are
 * guaranteed, which is exactly the state in which an upload may be shown. Anything else in the
 * batch failed, and a failed slot has no url to put in a message.
 */
export const toChatUploads = (views: readonly UploadView[]): ChatUpload[] =>
    views.filter(isUploadStored).map(view => ({
        id: view.id,
        name: view.name ?? '',
        url: view.url,
        contentType: view.contentType,
        contentSize: view.contentSize,
        width: view.width,
        height: view.height,
    }));
