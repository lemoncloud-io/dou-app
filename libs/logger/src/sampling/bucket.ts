export const fnv1a32 = (text: string): number => {
    let hash = 0x811c9dc5;

    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }

    return hash >>> 0;
};

export const samplingBucket = (runId: string, salt: string): number => (fnv1a32(`${runId}:${salt}`) % 10_000) / 10_000;
