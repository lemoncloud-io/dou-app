/**
 * FNV-1a (32-bit) over UTF-16 code units.
 *
 * The same function `@chatic/perf` uses for its run sampling, restated because this package imports
 * nothing. It is short, dependency-free and gives the same answer in every runtime, which matters
 * more here than avalanche quality: a run's verdict must not depend on where it is computed. Run ids
 * are ASCII, so code units and UTF-8 bytes agree. `Math.imul` keeps the multiply in 32-bit integers.
 */
export const fnv1a32 = (text: string): number => {
    let hash = 0x811c9dc5;

    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }

    return hash >>> 0;
};

/**
 * Where a run falls in `[0, 1)` for one stream: `FNV-1a(runId + ":" + salt) % 10000 / 10000`.
 *
 * The salt is what lets a run be sampled for one stream and not the other, while staying consistent
 * inside a stream — a sampled run sends every record of that stream, so a slow trace can be read
 * next to the other traces of the same run. Changing a salt reshuffles every run, so the salts are a
 * contract, not a detail.
 */
export const samplingBucket = (runId: string, salt: string): number => (fnv1a32(`${runId}:${salt}`) % 10_000) / 10_000;
