#!/usr/bin/env node
/**
 * Rewrite a minified stack trace back to original files, using the bundle's
 * source map.
 *
 *   node scripts/resolve-stack.js <bundle>.js.map < stack.txt
 *   pbpaste | node scripts/resolve-stack.js index-dJJnUF5m.js.map
 *
 * Why this exists: an error report stores the stack as text, so by the time a
 * human reads it in admin there is no devtools to resolve it — every frame is
 * `index-<hash>.js:2:845134`.
 *
 * Maps are not deployed (publishing them would publish the sources, via
 * `sourcesContent`), so take the one CI archived for that build:
 *
 *   gh run download <run-id> -n sourcemaps-web-<sha>
 *
 * The right artifact is the one holding `index-<hash>.js.map` for the hash the
 * stack names — that match is the check. Column offsets shift between builds,
 * so a map from any other build resolves to the wrong lines without saying so.
 *
 * `scripts/trace-report.js` (`yarn trace`) wraps this with artifact lookup, so
 * reach for that first; this stays the plumbing for a map you already hold.
 *
 * Decoding is inline rather than via the `source-map` package: that package is
 * only present transitively here, and a debugging aid should not be the reason
 * a dependency enters the tree. The format is small — base64-VLQ segments,
 * `;` between generated lines, `,` between segments.
 */

const fs = require('fs');

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((char, i) => [char, i]));

/** Decodes the base64-VLQ numbers of one `,`-separated segment. */
const decodeSegment = segment => {
    const values = [];
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
 * except the generated column is a running delta across the whole file, so the
 * decode has to walk it in order.
 */
const buildIndex = mappings => {
    const lines = [];
    let sourceIndex = 0;
    let sourceLine = 0;
    let sourceColumn = 0;
    let nameIndex = 0;

    mappings.split(';').forEach(rawLine => {
        const segments = [];
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
    });

    return lines;
};

/** The mapping covering `column` is the last one that starts at or before it. */
const findSegment = (segments, column) => {
    let low = 0;
    let high = segments.length - 1;
    let found;

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
const readBundleNames = stack => {
    const names = new Set();

    for (const [, , url] of stack.matchAll(FRAME)) {
        const file = url.split('/').pop();
        if (file && file.endsWith('.js')) names.add(file);
    }

    return [...names];
};

/**
 * Rewrites every frame of `stack` that `map` can place. Frames with no mapping
 * — a generated-only position, another bundle, a native frame — are left as
 * they are, so nothing is lost when only part of a trace resolves.
 *
 * Pass `bundle` when the trace spans more than one: a line/column lookup
 * succeeds against any map, so without the filter one bundle's map silently
 * places another bundle's frames in the wrong file.
 */
const resolveStack = (map, stack, bundle) => {
    const index = buildIndex(map.mappings || '');

    return stack.replace(FRAME, (whole, name, url, line, column) => {
        if (bundle && url.split('/').pop() !== bundle) return whole;

        const segments = index[Number(line) - 1];
        if (!segments || !segments.length) return whole;

        const segment = findSegment(segments, Number(column));
        if (!segment || segment.sourceIndex === undefined) return whole;

        const source = (map.sources[segment.sourceIndex] || '?').replace(/^.*?(apps\/|libs\/|node_modules\/)/, '$1');
        const symbol = (segment.nameIndex !== undefined && map.names[segment.nameIndex]) || name || '?';

        return `${symbol} (${source}:${segment.sourceLine + 1}:${segment.sourceColumn})`;
    });
};

const main = () => {
    const mapPath = process.argv[2];
    if (!mapPath) {
        console.error('usage: node scripts/resolve-stack.js <bundle>.js.map < stack.txt');
        process.exit(1);
    }

    const map = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    const resolved = resolveStack(map, fs.readFileSync(0, 'utf8'));
    process.stdout.write(resolved.endsWith('\n') ? resolved : `${resolved}\n`);
};

if (require.main === module) main();

module.exports = { decodeSegment, buildIndex, findSegment, readBundleNames, resolveStack };
