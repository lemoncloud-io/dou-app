import { isSafeImageUrl, type ChatImage } from './chatImages';

const clickSave = (href: string, name: string): void => {
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = name;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
};

const EXTENSIONS: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
};

/** A sent image is named by its place in the message; give the saved file the extension its bytes have. */
const withExtension = (name: string, type: string): string => {
    const extension = EXTENSIONS[type];
    return !extension || /\.[a-z0-9]+$/i.test(name) ? name : `${name}.${extension}`;
};

/**
 * Save one image under its own name. An anchor with `download` works for object URLs and
 * same-origin files; the Electron shell turns it into its save flow. A sent image lives at a signed
 * address on another origin, where Chromium ignores `download` and navigates instead — so it is
 * fetched first and saved from an object URL. Rejects when that fetch fails, having clicked nothing.
 */
/**
 * The bytes of a remote image. Only an address an image may come from, and without this page's
 * cookies — the address is signed, and it came from message data.
 */
const fetchImage = async (url: string): Promise<Blob> => {
    if (!isSafeImageUrl(url)) throw new Error('image address refused');
    const response = await fetch(url, { credentials: 'omit' });
    if (!response.ok) throw new Error(`image fetch failed: ${response.status}`);
    return response.blob();
};

export const downloadImage = async (image: Pick<ChatImage, 'url' | 'name'>): Promise<void> => {
    if (image.url.startsWith('blob:') || image.url.startsWith('data:image/')) {
        clickSave(image.url, image.name);
        return;
    }
    const blob = await fetchImage(image.url);
    const href = URL.createObjectURL(blob);
    clickSave(href, withExtension(image.name, blob.type));
    // After the click has handed the bytes to the download, not before it.
    setTimeout(() => URL.revokeObjectURL(href), 0);
};

/**
 * "Download all": one save per image. Spaced out because Chromium drops back-to-back
 * programmatic downloads after the first as a multiple-download guard. `onFailed` hears
 * about each image that could not be fetched.
 */
export const downloadImages = (images: readonly Pick<ChatImage, 'url' | 'name'>[], onFailed: () => void): void => {
    images.forEach((image, index) => {
        setTimeout(() => void downloadImage(image).catch(onFailed), index * 150);
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

/** "Copy image": the pixels of this one image onto the clipboard. Rejects when the platform refuses. */
export const copyImageToClipboard = async (url: string): Promise<void> => {
    const png = await toPngBlob(await fetchImage(url));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
};
