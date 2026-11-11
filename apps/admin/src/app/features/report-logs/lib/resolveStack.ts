/**
 * `lib/report-logs/resolveStack.ts`
 * - Turns a stored minified stack back into original files using a source map
 *   the operator supplies from the build's CI artifact.
 *
 * A report keeps its stack as text, so there is no devtools here to resolve it
 * — every frame reads `index-<hash>.js:2:845134`. Maps are deliberately not
 * deployed (serving them publishes the sources via `sourcesContent`), so the
 * map has to come from the person looking: pick the `sourcemaps-*` artifact of
 * the build the report came from and drop the file in. It is read in the
 * browser and never uploaded anywhere.
 *
 * Decoding is inline rather than a dependency — the format is small (base64-VLQ
 * segments, `;` between generated lines, `,` between segments) and a 5MB map
 * decodes in ~60ms, so there is nothing to gain from a library or a worker.
 * The same decoder runs headless in `scripts/resolve-stack.js`.
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((char, i) => [char, i] as const));

export interface RawSourceMap {
    sources: string[];
    names: string[];
    mappings: string;
}

interface Segment {
    generatedColumn: number;
    sourceIndex?: number;
    sourceLine?: number;
    sourceColumn?: number;
    nameIndex?: number;
}

/** Decodes the base64-VLQ numbers of one `,`-separated segment. */
export const decodeSegment = (segment: string): number[] => {
    const values: number[] = [];
    let shift = 0;
    let accumulated = 0;

    for (const char of segment) {
        const digit = B64_INDEX.get(char);
        if (digit === undefined) return values;

        accumulated += (digit & 0b11111) << shift;
        if (digit & 0b100000) {
            // Continuation bit: more digits belong to this number.
            shift += 5;
            continue;
        }

        // Least-significant bit is the sign, the rest is the magnitude.
        const magnitude = accumulated >> 1;
        values.push(accumulated & 1 ? -magnitude : magnitude);
        shift = 0;
        accumulated = 0;
    }

    return values;
};

/**
 * Expands `mappings` into one array of segments per generated line. Every field
 * except the generated column is a running delta across the whole file, so this
 * has to walk it in order — which is also why the whole map is decoded at once
 * and kept, rather than resolved frame by frame.
 */
const buildIndex = (mappings: string): Segment[][] => {
    const lines: Segment[][] = [];
    let sourceIndex = 0;
    let sourceLine = 0;
    let sourceColumn = 0;
    let nameIndex = 0;

    for (const rawLine of mappings.split(';')) {
        const segments: Segment[] = [];
        let generatedColumn = 0; // resets on every generated line

        for (const raw of rawLine.split(',')) {
            if (!raw) continue;
            const [dGenCol, dSrcIdx, dSrcLine, dSrcCol, dNameIdx] = decodeSegment(raw);
            if (dGenCol === undefined) continue;

            generatedColumn += dGenCol;
            if (dSrcIdx === undefined) {
                // A generated-only segment (no original position).
                segments.push({ generatedColumn });
                continue;
            }

            sourceIndex += dSrcIdx;
            sourceLine += dSrcLine;
            sourceColumn += dSrcCol;
            if (dNameIdx !== undefined) nameIndex += dNameIdx;

            segments.push({
                generatedColumn,
                sourceIndex,
                sourceLine,
                sourceColumn,
                nameIndex: dNameIdx === undefined ? undefined : nameIndex,
            });
        }

        lines.push(segments);
    }

    return lines;
};

/** The mapping covering `column` is the last one that starts at or before it. */
const findSegment = (segments: Segment[], column: number): Segment | undefined => {
    let low = 0;
    let high = segments.length - 1;
    let found: Segment | undefined;

    while (low <= high) {
        const mid = (low + high) >> 1;
        if (segments[mid].generatedColumn <= column) {
            found = segments[mid];
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }

    return found;
};

// Matches Safari (`name@url:line:col`) and Chrome (`at name (url:line:col)`).
const FRAME = /([\w$.]*)@?\(?((?:https?:\/\/)?[^\s():]+):(\d+):(\d+)\)?/g;

/** Bundle file names a stack refers to, e.g. `index-dJJnUF5m.js`. */
export const readBundleNames = (stack: string): string[] => {
    const names = new Set<string>();
    for (const [, , url] of stack.matchAll(FRAME)) {
        const file = url.split('/').pop();
        if (file?.endsWith('.js')) names.add(file);
    }
    return [...names];
};

/**
 * Rewrites every frame `map` can place. Frames it cannot — a generated-only
 * position, another bundle, a native frame — are left untouched, so a partial
 * resolve never loses the rest of the trace.
 *
 * Pass `bundle` when the trace spans more than one: a line/column lookup
 * succeeds against any map, so without the filter one bundle's map silently
 * places another bundle's frames in the wrong file.
 */
export const resolveStack = (map: RawSourceMap, stack: string, bundle?: string): string => {
    const index = buildIndex(map.mappings || '');

    return stack.replace(FRAME, (whole, name: string, url: string, line: string, column: string) => {
        if (bundle && url.split('/').pop() !== bundle) return whole;

        const segments = index[Number(line) - 1];
        if (!segments?.length) return whole;

        const segment = findSegment(segments, Number(column));
        if (!segment || segment.sourceIndex === undefined) return whole;

        const source = (map.sources[segment.sourceIndex] || '?').replace(/^.*?(apps\/|libs\/|node_modules\/)/, '$1');
        const symbol = (segment.nameIndex !== undefined && map.names[segment.nameIndex]) || name || '?';

        return `${symbol} (${source}:${(segment.sourceLine ?? 0) + 1}:${segment.sourceColumn})`;
    });
};

/**
 * Whether this map plausibly belongs to the build the stack came from. The map
 * file is named after its bundle, so the check is a name match — and it matters:
 * column offsets shift between builds, so the wrong map resolves to wrong lines
 * without failing.
 */
export const mapMatchesStack = (mapFileName: string, stack: string): boolean => {
    const bundles = readBundleNames(stack);
    if (!bundles.length) return true; // nothing to check against
    return bundles.some(bundle => mapFileName === `${bundle}.map`);
};
