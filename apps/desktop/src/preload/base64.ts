const CHUNK_SIZE = 0x8000;

export const utf8ToBase64 = (value: string): string => {
    const bytes = new TextEncoder().encode(value);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK_SIZE));
    }
    return btoa(binary);
};
