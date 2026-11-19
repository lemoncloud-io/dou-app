import type { MediaPort } from '@chatic/runtime-client';

/**
 * A browser tab's `media` port for tests: what the page does on its own, with no runner's mock in it —
 * this file loads under jest and vitest alike. A tab picks with its own file input and has none of an
 * app's members. A test that needs to watch a member lays its own over this one.
 */
export const browserMedia = (): MediaPort => ({
    kind: 'browser',
    picker: null,
    photoLibrary: null,
    videoConverter: null,
    cameraPermission: null,
});
