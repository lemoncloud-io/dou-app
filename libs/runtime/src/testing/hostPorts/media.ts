import type { MediaPort } from '../../api';

export const browserMedia = (): MediaPort => ({
    kind: 'browser',
    picker: null,
    photoLibrary: null,
    videoConverter: null,
    cameraPermission: null,
});
