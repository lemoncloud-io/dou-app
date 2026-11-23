import { chatAttachmentExtension } from '@chatic/runtime';

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

export const saveBlob = (blob: Blob, name: string): void => {
    const href = URL.createObjectURL(blob);
    clickSave(href, name);
    setTimeout(() => URL.revokeObjectURL(href), 0);
};

export const withExtension = (name: string, type: string): string => {
    const extension = chatAttachmentExtension(type);
    return !extension || /\.[a-z0-9]+$/i.test(name) ? name : `${name}.${extension}`;
};

export const fetchFileBytes = async (url: string, signal?: AbortSignal, maxBytes?: number): Promise<Blob> => {
    if (!url.startsWith('https://')) throw new Error('file address refused');
    const headers = maxBytes ? { Range: `bytes=0-${maxBytes - 1}` } : undefined;
    const response = await fetch(url, { credentials: 'omit', cache: 'no-store', signal, headers });
    if (!response.ok) throw new Error(`file fetch failed: ${response.status}`);
    if (!maxBytes || response.status === 206 || !response.body) return response.blob();
    const reader = response.body.getReader() as ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>>;
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    while (size < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        size += value.length;
    }
    void reader.cancel();
    return new Blob(chunks);
};

const fetchImage = async (url: string): Promise<Blob> => {
    if (!isSafeImageUrl(url)) throw new Error('image address refused');
    return fetchFileBytes(url);
};

export const downloadImage = async (image: Pick<ChatImage, 'url' | 'name'>): Promise<void> => {
    if (image.url.startsWith('blob:') || image.url.startsWith('data:image/')) {
        clickSave(image.url, image.name);
        return;
    }
    const blob = await fetchImage(image.url);
    saveBlob(blob, withExtension(image.name, blob.type));
};

export const downloadImages = <T extends Pick<ChatImage, 'url' | 'name'>>(
    images: readonly T[],
    onFailed: () => void,
    save: (image: T) => Promise<void> = downloadImage
): void => {
    images.forEach((image, index) => {
        setTimeout(() => void save(image).catch(onFailed), index * 150);
    });
};

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

export const copyImageToClipboard = async (url: string): Promise<void> => {
    const png = await toPngBlob(await fetchImage(url));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
};
