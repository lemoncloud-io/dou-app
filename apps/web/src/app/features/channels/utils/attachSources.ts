import { chatAttachmentAccept, type ChatAttachmentRejection, type ChatAttachmentSource } from '@chatic/data';

/**
 * Whether the page runs in iOS or iPadOS WebKit — Safari, or the app's own WebView. An iPad asks for
 * the desktop site and says `Macintosh`; a touch screen is what gives it away.
 */
export const isAppleTouchWebKit = (
    userAgent: string = typeof navigator === 'undefined' ? '' : navigator.userAgent,
    maxTouchPoints: number = typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints
): boolean => /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);

/**
 * What the page's own "choose from album" input takes. iOS WebKit hands a picked video over as a
 * QuickTime `.mov` whatever the source was — the server takes only `mp4` — and converts it silently for
 * up to minutes first, so offering videos there only leads to a long wait and a refusal. It gets photos.
 */
export const albumAccept = (appleTouchWebKit: boolean): string =>
    chatAttachmentAccept(appleTouchWebKit ? ['image'] : ['image', 'video']);

/** What the page's own "choose from files" input takes: the server's seven document formats. */
export const DOCUMENT_ACCEPT = chatAttachmentAccept(['file']);

const typeOf = (item: ChatAttachmentSource): string => item.type;

/**
 * The notice for the first refused item of a pick. An unknown format is named for what it looked like —
 * a photo, a video (the QuickTime a page input gives), anything else — since the fix differs for each.
 */
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
