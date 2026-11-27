import { browserImages } from '@chatic/host-web-browser';
import type { MediaPort } from '@chatic/ports';

import type { ShellBridge } from './bridge';

export const PICK_TIMEOUT_MS = 30 * 60_000;

export const READ_ATTACHMENT_TIMEOUT_MS = 2 * 60_000;

export const PREPARE_VIDEO_TIMEOUT_MS = 10 * 60_000;

export const PHOTO_LIST_TIMEOUT_MS = 60_000;

export const PHOTO_READ_TIMEOUT_MS = 120_000;

export const KEEP_LIBRARY_VIDEO_TIMEOUT_MS = 10 * 60_000;

export const MANAGE_PHOTO_SELECTION_TIMEOUT_MS = 300_000;

export const PERMISSION_REQUEST_TIMEOUT_MS = 60_000;

export const mobileShellMedia =
    (bridge: ShellBridge) =>
    (base: Pick<MediaPort, 'kind'>): MediaPort => ({
        ...base,
        picker: {
            pick: async input => {
                const { data } = await bridge.request(
                    { type: 'PickAttachments', data: input },
                    { timeoutMs: PICK_TIMEOUT_MS }
                );
                return data;
            },
            read: async uri => {
                const { data } = await bridge.request(
                    { type: 'ReadAttachment', data: { uri } },
                    { timeoutMs: READ_ATTACHMENT_TIMEOUT_MS }
                );
                return data;
            },
        },
        photoLibrary: {
            albums: async (input = {}) =>
                (await bridge.request({ type: 'ListPhotoAlbums', data: input }, { timeoutMs: PHOTO_LIST_TIMEOUT_MS }))
                    .data,
            photos: async input =>
                (await bridge.request({ type: 'ListPhotos', data: input }, { timeoutMs: PHOTO_LIST_TIMEOUT_MS })).data,
            read: async id =>
                (await bridge.request({ type: 'ReadPhoto', data: { id } }, { timeoutMs: PHOTO_READ_TIMEOUT_MS })).data,
            keepVideo: async id =>
                (
                    await bridge.request(
                        { type: 'KeepLibraryVideo', data: { id } },
                        { timeoutMs: KEEP_LIBRARY_VIDEO_TIMEOUT_MS }
                    )
                ).data,
            manageSelection: async () =>
                (
                    await bridge.request(
                        { type: 'ManagePhotoSelection', data: {} },
                        { timeoutMs: MANAGE_PHOTO_SELECTION_TIMEOUT_MS }
                    )
                ).data,
        },
        videoConverter: {
            prepare: async uri => {
                const { data } = await bridge.request(
                    { type: 'PrepareVideo', data: { uri } },
                    { timeoutMs: PREPARE_VIDEO_TIMEOUT_MS }
                );
                return data;
            },
        },
        cameraPermission: {
            request: async () =>
                (
                    await bridge.request(
                        { type: 'RequestPermission', data: { permission: 'CAMERA' } },
                        { timeoutMs: PERMISSION_REQUEST_TIMEOUT_MS }
                    )
                ).data?.status ?? null,
        },
        images: browserImages,
    });
