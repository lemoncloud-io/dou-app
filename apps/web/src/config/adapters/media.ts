import { webClient } from '@chatic/bridges';
import { mediaAdapters } from '@chatic/runtime-web';
import type { MediaPort, ShellOrBrowserImplementations } from '@chatic/runtime-web';

// Direct path, not the `bridge` barrel: the barrel re-exports its navigation, which pulls in the
// web transport and its `import.meta.env` — a syntax error under ts-jest's CommonJS output.
import { appBridge } from '../../app/bridge/appBridge';

/**
 * The picker stays open for as long as the person browses, and the answer waits for every copy: ten
 * videos are copied after the picker closes. The bound only has to outlast that, not to be tight.
 */
export const PICK_TIMEOUT_MS = 30 * 60_000;

/** One prepared photo, the same bound as the grid's `ReadPhoto`. */
export const READ_ATTACHMENT_TIMEOUT_MS = 2 * 60_000;

/** A 4K minute converts in tens of seconds on a phone; a few minutes of it in several. */
export const PREPARE_VIDEO_TIMEOUT_MS = 10 * 60_000;

/**
 * Who picks the photos, videos and documents a person attaches in the web app: the shell or the page. Its
 * shell is the phone app, reached through `appBridge`, which has its own picker, photo library and video
 * conversion, and asks for the camera before the page opens one; the page uses its own file input and
 * has none of them.
 */
export const webMedia: ShellOrBrowserImplementations<'media'> = {
    shell: (base): MediaPort => ({
        ...base,
        picker: {
            pick: async input => {
                const { data } = await webClient.request(
                    { type: 'PickAttachments', data: input },
                    { timeoutMs: PICK_TIMEOUT_MS }
                );
                return data;
            },
            read: async uri => {
                const { data } = await webClient.request(
                    { type: 'ReadAttachment', data: { uri } },
                    { timeoutMs: READ_ATTACHMENT_TIMEOUT_MS }
                );
                return data;
            },
        },
        photoLibrary: {
            albums: async input => (await appBridge.listPhotoAlbums(input)).data,
            photos: async input => (await appBridge.listPhotos(input)).data,
            read: async id => (await appBridge.readPhoto(id)).data,
            keepVideo: async id => (await appBridge.keepLibraryVideo(id)).data,
            manageSelection: async () => (await appBridge.managePhotoSelection()).data,
        },
        videoConverter: {
            prepare: async uri => {
                const { data } = await webClient.request(
                    { type: 'PrepareVideo', data: { uri } },
                    { timeoutMs: PREPARE_VIDEO_TIMEOUT_MS }
                );
                return data;
            },
        },
        // Android's WebView never asks for itself when a capturing file input is tapped: without the
        // permission it opens nothing and the page hears nothing back. Asking first is how a refusal
        // reaches the page at all.
        cameraPermission: {
            request: async () => (await appBridge.requestPermission('CAMERA')).data?.status ?? null,
        },
    }),
    browser: (base): MediaPort => ({
        ...base,
        picker: null,
        photoLibrary: null,
        videoConverter: null,
        cameraPermission: null,
    }),
};

/** `media.host` follows what the host declared; `.shell` and `.browser` force a side the host allows. */
export const { host: mediaHost, shell: mediaShell, browser: mediaBrowser } = mediaAdapters(webMedia);
