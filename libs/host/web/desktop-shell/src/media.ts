import type { MediaPort } from '@chatic/ports';

export const desktopMedia = (base: Pick<MediaPort, 'kind'>): MediaPort => ({
    ...base,
    picker: null,
    photoLibrary: null,
    videoConverter: null,
    cameraPermission: null,
});
