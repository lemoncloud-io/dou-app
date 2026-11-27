import { webClient } from '@chatic/bridges';
import { mediaAdapters } from '@chatic/runtime-hybrid-web';
import type { MediaPort, ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

import { appBridge } from '../../app/bridge/appBridge';

export const PICK_TIMEOUT_MS = 30 * 60_000;

export const READ_ATTACHMENT_TIMEOUT_MS = 2 * 60_000;

export const PREPARE_VIDEO_TIMEOUT_MS = 10 * 60_000;

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

export const { host: mediaHost, shell: mediaShell, browser: mediaBrowser } = mediaAdapters(webMedia);
