export interface DecodedImage {
    image: HTMLImageElement;
    width: number;
    height: number;
}

export const decodeImage = (file: File): Promise<DecodedImage | null> =>
    new Promise(resolve => {
        const url = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(url);
            const { naturalWidth: width, naturalHeight: height } = img;
            resolve(width && height ? { image: img, width, height } : null);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };

        img.src = url;
    });
