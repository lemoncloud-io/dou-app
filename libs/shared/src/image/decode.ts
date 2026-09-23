/** A source the browser has read, with the dimensions it will actually be drawn at. */
export interface DecodedImage {
    image: HTMLImageElement;
    /** EXIF already applied, so a portrait photo reports its portrait dimensions. */
    width: number;
    height: number;
}

/**
 * Read `file` into something that can be drawn, resolving `null` when the browser cannot.
 *
 * **This is where EXIF orientation is decided**, which is why it is one function and not a step
 * copied into each caller. `<img>` rather than `createImageBitmap`: `<img>` has applied orientation
 * since `image-orientation: from-image` became the CSS initial value, which is the longest-standing
 * behaviour of the routes available, so a portrait photo does not arrive on its side. Measured
 * 2026-09-21 in Chrome 152 — `<img>`, `createImageBitmap` default, and `createImageBitmap` with
 * `{ imageOrientation: 'from-image' }` all applied it, the default having followed the 2021 spec
 * change. The oldest of the three is the one that needs no support check.
 *
 * `null` rather than a rejection: every caller of this module has something better to do than fail,
 * and the one caller that must fail (an inline data URL, which has nothing to fall back to) says so
 * itself.
 *
 * A format this browser cannot read — HEIC outside Safari is the common one — lands here.
 */
export const decodeImage = (file: File): Promise<DecodedImage | null> =>
    new Promise(resolve => {
        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(url);
            const { naturalWidth: width, naturalHeight: height } = img;
            // A decode that reports no size is a decode that failed, whatever the event said.
            resolve(width && height ? { image: img, width, height } : null);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };

        img.src = url;
    });
