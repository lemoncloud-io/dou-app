import type { MediaPort } from '@chatic/runtime-client';

export const browserMedia = (): MediaPort => ({
    kind: 'browser',
    picker: null,
    photoLibrary: null,
    videoConverter: null,
    cameraPermission: null,
});
