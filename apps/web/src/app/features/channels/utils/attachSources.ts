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

/**
 * What the page's own "choose from files" input takes on iOS and iPadOS WebKit: the server's seven
 * document formats, plus the generic `application/octet-stream`. iOS WebKit matches neither HWP's MIME
 * types nor its `.hwp`/`.hwpx` extensions against the type Files gives such a file, so with the seven
 * alone it greys HWP and HWPX out. The generic type is what lets them through — and with them any other
 * file, photos and MP4s in Files included, which the page's own judgement (`chatAttachmentFormat`) then
 * takes or refuses. It keeps the document picker opening directly, where no `accept` at all, or an
 * image or video type in it, would first offer the photo library and the camera.
 */
const APPLE_DOCUMENT_ACCEPT = `${chatAttachmentAccept(['file'])},application/octet-stream`;

/**
 * What the page's own "choose from files" input takes: every format the server takes, so a photo or an
 * MP4 kept among files can be sent from here too, and nothing it would refuse. On iOS WebKit that is
 * `APPLE_DOCUMENT_ACCEPT`, which already lets any Files item through by the generic type, and must not name
 * an image or video type (see there). Elsewhere — Android's WebView, desktop browsers — the twelve
 * formats are named outright, plus the generic type, under which a system that does not know HWP
 * offers it.
 */
export const documentAccept = (appleTouchWebKit: boolean): string =>
    appleTouchWebKit
        ? APPLE_DOCUMENT_ACCEPT
        : `${chatAttachmentAccept(['image', 'video', 'file'])},application/octet-stream`;

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
