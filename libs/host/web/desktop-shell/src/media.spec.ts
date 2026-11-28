import { desktopMedia } from './media';

describe('desktopMedia', () => {
    it.each(['shell', 'browser'] as const)(
        "leaves the picking to the page (%s): none of the phone app's pieces and no image preparation",
        kind => {
            expect(desktopMedia({ kind })).toEqual({
                kind,
                picker: null,
                photoLibrary: null,
                videoConverter: null,
                cameraPermission: null,
            });
        }
    );
});
