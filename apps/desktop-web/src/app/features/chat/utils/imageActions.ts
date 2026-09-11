import type { ChatImage } from './chatImages';

/**
 * Save one image under its own name. An anchor with `download` works for object URLs
 * and same-origin files; the Electron shell turns it into its save flow.
 */
export const downloadImage = (image: Pick<ChatImage, 'url' | 'name'>): void => {
    const anchor = document.createElement('a');
    anchor.href = image.url;
    anchor.download = image.name;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
};

/**
 * "전체 다운로드": one save per image. Spaced out because Chromium drops back-to-back
 * programmatic downloads after the first as a multiple-download guard.
 */
export const downloadImages = (images: readonly Pick<ChatImage, 'url' | 'name'>[]): void => {
    images.forEach((image, index) => {
        setTimeout(() => downloadImage(image), index * 150);
    });
};

/**
 * Re-encode to PNG: the async clipboard only accepts `image/png` in Chromium, so a
 * JPEG or WebP has to go through a canvas first.
 */
const toPngBlob = async (source: Blob): Promise<Blob> => {
    if (source.type === 'image/png') return source;
    const bitmap = await createImageBitmap(source);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    bitmap.close();
    return new Promise((resolve, reject) =>
        canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('PNG encode failed'))), 'image/png')
    );
};

/** "이미지 복사": the pixels of this one image onto the clipboard. Rejects when the platform refuses. */
export const copyImageToClipboard = async (url: string): Promise<void> => {
    const response = await fetch(url);
    const png = await toPngBlob(await response.blob());
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
};
