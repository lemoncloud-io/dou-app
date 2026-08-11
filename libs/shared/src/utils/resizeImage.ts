/**
 * Square center-crop to a JPEG data URL. Built for avatars/thumbnails, where a
 * fixed square is the point — use `scaleImageToDataUrl` when the whole frame has
 * to survive (screenshots), since cropping one throws away most of it.
 */
export const resizeImageToBase64 = (file: File, size = 150): Promise<string> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Failed to get canvas context'));
                return;
            }

            // 비율 유지하며 center crop
            const scale = Math.max(size / img.width, size / img.height);
            const scaledW = img.width * scale;
            const scaledH = img.height * scale;
            const offsetX = (size - scaledW) / 2;
            const offsetY = (size - scaledH) / 2;

            ctx.drawImage(img, offsetX, offsetY, scaledW, scaledH);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };

        img.src = url;
    });

export interface ScaleImageOptions {
    /** Longest edge of the output, in px. Smaller images are left alone. */
    maxEdge?: number;
    /** JPEG quality, 0–1. */
    quality?: number;
}

/**
 * Downscale to a JPEG data URL, keeping the aspect ratio and the whole frame.
 *
 * For attachments that are read rather than recognised — a screenshot of a bug —
 * so nothing is cropped and images already under `maxEdge` are re-encoded at the
 * requested quality but never upscaled.
 *
 * The defaults are a payload budget, not a taste call: a feedback report carries
 * its images inline as base64, and base64 costs ~4 bytes per 3, so the encoded
 * size is what bounds how many can be attached.
 */
export const scaleImageToDataUrl = (file: File, { maxEdge = 1024, quality = 0.6 }: ScaleImageOptions = {}) =>
    new Promise<string>((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(url);
            const { width, height } = img;
            if (!width || !height) {
                reject(new Error('Failed to read image size'));
                return;
            }

            // Never upscale: a 400px screenshot blown up to 1024 costs bytes and adds no detail.
            const scale = Math.min(1, maxEdge / Math.max(width, height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(width * scale);
            canvas.height = Math.round(height * scale);

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Failed to get canvas context'));
                return;
            }

            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image'));
        };

        img.src = url;
    });
