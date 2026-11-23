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

export const decodeSegment = (segment: string): number[] => {
    const values: number[] = [];
    let shift = 0;
    let accumulated = 0;

    for (const char of segment) {
        const digit = B64_INDEX.get(char);
        if (digit === undefined) return values;

        accumulated += (digit & 0b11111) << shift;
        if (digit & 0b100000) {
            shift += 5;
            continue;
        }

        const magnitude = accumulated >> 1;
        values.push(accumulated & 1 ? -magnitude : magnitude);
        shift = 0;
        accumulated = 0;
    }

    return values;
};

const buildIndex = (mappings: string): Segment[][] => {
    const lines: Segment[][] = [];
    let sourceIndex = 0;
    let sourceLine = 0;
    let sourceColumn = 0;
    let nameIndex = 0;

    for (const rawLine of mappings.split(';')) {
        const segments: Segment[] = [];
        let generatedColumn = 0;

        for (const raw of rawLine.split(',')) {
            if (!raw) continue;
            const [dGenCol, dSrcIdx, dSrcLine, dSrcCol, dNameIdx] = decodeSegment(raw);
            if (dGenCol === undefined) continue;

            generatedColumn += dGenCol;
            if (dSrcIdx === undefined) {
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

const FRAME = /([\w$.]*)@?\(?((?:https?:\/\/)?[^\s():]+):(\d+):(\d+)\)?/g;

export const readBundleNames = (stack: string): string[] => {
    const names = new Set<string>();
    for (const [, , url] of stack.matchAll(FRAME)) {
        const file = url.split('/').pop();
        if (file?.endsWith('.js')) names.add(file);
    }
    return [...names];
};

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

export const mapMatchesStack = (mapFileName: string, stack: string): boolean => {
    const bundles = readBundleNames(stack);
    if (!bundles.length) return true;
    return bundles.some(bundle => mapFileName === `${bundle}.map`);
};
