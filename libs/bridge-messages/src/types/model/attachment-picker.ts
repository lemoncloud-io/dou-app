export type AttachmentPickSource = 'media' | 'document';

export type AttachmentMaxBytes = {
    image: number;
    video: number;
    file: number;
};

export type PickAttachmentsPayload = {
    source: AttachmentPickSource;
    selectionLimit: number;
    maxBytes: AttachmentMaxBytes;
};

export type PickAttachmentsErrorCode = 'BUSY' | 'INVALID' | 'INTERNAL';

export type PickedImageAttachment = {
    kind: 'image';
    uri: string;
    name: string;
    contentType: string;
    size: number;
    width: number;
    height: number;
};

export type PickedShellAttachment = {
    kind: 'video' | 'file';
    uri: string;
    name: string;
    contentType: string;
    size: number;
    needsExport?: boolean;
};

export type PickedAttachment = PickedImageAttachment | PickedShellAttachment;

export type AttachmentRefusalReason = 'too-large' | 'unsupported' | 'unreadable';

export type RefusedAttachment = {
    name: string;
    kind: 'image' | 'video' | 'file';
    reason: AttachmentRefusalReason;
};

export type OnPickAttachmentsPayload = {
    items: PickedAttachment[];
    refused: RefusedAttachment[];
};

export type ReadAttachmentPayload = {
    uri: string;
};

export type OnReadAttachmentPayload = {
    base64: string;
    mimeType: string;
    fileName: string;
    width: number;
    height: number;
};

export type ReadAttachmentErrorCode = 'INVALID' | 'SOURCE' | 'INTERNAL';

export type PrepareVideoErrorCode = 'TOO_LARGE' | 'UNSUPPORTED' | 'SOURCE' | 'SYSTEM' | 'INVALID';

export type PrepareVideoPayload = {
    uri: string;
};

export type OnPrepareVideoPayload = {
    file: {
        uri: string;
        name: string;
        contentType: 'video/mp4';
        size: number;
        width: number;
        height: number;
    };
    poster: {
        uri: string;
        base64: string;
        contentType: 'image/jpeg';
        size: number;
        width: number;
        height: number;
    } | null;
};

export type ReadVideoFramePayload = {
    url: string;
    atMs: number;
    maxEdge: number;
};

export type OnReadVideoFramePayload = {
    base64: string;
    contentType: 'image/jpeg';
    width: number;
    height: number;
};

export type ReadVideoFrameErrorCode = 'INVALID' | 'UNREADABLE';
