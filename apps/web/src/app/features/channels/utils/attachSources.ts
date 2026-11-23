import { chatAttachmentAccept, type ChatAttachmentRejection, type ChatAttachmentSource } from '@chatic/runtime';

import { PHONE_SENDS } from '../../../utils';

export const isAppleTouchWebKit = (
    userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
    maxTouchPoints: number = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints
): boolean => /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);

export const albumAccept = (appleTouchWebKit: boolean): string =>
    chatAttachmentAccept(appleTouchWebKit ? ['image'] : ['image', 'video'], PHONE_SENDS);

const APPLE_DOCUMENT_ACCEPT = `${chatAttachmentAccept(['file'], PHONE_SENDS)},application/octet-stream`;

export const documentAccept = (appleTouchWebKit: boolean): string =>
    appleTouchWebKit
        ? APPLE_DOCUMENT_ACCEPT
        : `${chatAttachmentAccept(['image', 'video', 'file'], PHONE_SENDS)},application/octet-stream`;

const typeOf = (item: ChatAttachmentSource): string => item.type;

export const rejectionKey = (rejection: ChatAttachmentRejection, item: ChatAttachmentSource): string => {
    switch (rejection.reason) {
        case 'too-large':
            return `chat.attach.rejected.too-large.${rejection.kind}`;
        case 'unsupported': {
            const type = typeOf(item);
            if (type.startsWith('image/')) return 'chat.attach.rejected.unsupportedImage';
            if (type.startsWith('video/')) return 'chat.attach.rejected.unsupportedVideo';
            return 'chat.attach.rejected.unsupported';
        }
        default:
            return `chat.attach.rejected.${rejection.reason}`;
    }
};
