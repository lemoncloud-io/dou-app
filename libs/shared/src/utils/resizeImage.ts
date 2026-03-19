export const resizeImageToBase64 = (file: File, size = 50): Promise<string> =>
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
