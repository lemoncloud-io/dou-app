/**
 * The app's own rule for a reaction's emoji, copied here so the mock refuses what the app refuses. The
 * app's contract suite holds this copy to the app's over a set of samples, so the two cannot drift.
 */

/** The longest reaction, in UTF-16 code units. */
const REACTION_LIMIT = 16;

const isJoiner = (cp: number) => cp === 0x200d;
/** Marks that combine with the letter before them. At most two follow one letter. */
const isCombiningMark = (cp: number) =>
    (cp >= 0x0300 && cp <= 0x036f) || (cp >= 0x1ab0 && cp <= 0x1aff) || (cp >= 0x1dc0 && cp <= 0x1dff);
const isVariationSelector = (cp: number) => (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef);
const isSkinTone = (cp: number) => cp >= 0x1f3fb && cp <= 0x1f3ff;
const isKeycap = (cp: number) => cp === 0x20e3;
/** The tag characters a subdivision flag spells after a black flag, ending with the cancel tag. */
const isTag = (cp: number) => cp >= 0xe0020 && cp <= 0xe007f;
const BLACK_FLAG = 0x1f3f4;
const isRegionalIndicator = (cp: number) => cp >= 0x1f1e6 && cp <= 0x1f1ff;
/**
 * Code points an emoji is drawn from — the blocks of pictographs, symbols and dingbats, written out as
 * ranges since the app's JavaScript engine is not relied on for Unicode property escapes.
 */
const isPictographic = (cp: number) =>
    cp === 0x00a9 ||
    cp === 0x00ae ||
    cp === 0x203c ||
    cp === 0x2049 ||
    cp === 0x2122 ||
    cp === 0x2139 ||
    (cp >= 0x2190 && cp <= 0x21ff) ||
    (cp >= 0x2300 && cp <= 0x23ff) ||
    cp === 0x24c2 ||
    (cp >= 0x25a0 && cp <= 0x27bf) ||
    (cp >= 0x2900 && cp <= 0x297f) ||
    (cp >= 0x2b00 && cp <= 0x2bff) ||
    cp === 0x3030 ||
    cp === 0x303d ||
    cp === 0x3297 ||
    cp === 0x3299 ||
    (cp >= 0x1f000 && cp <= 0x1faff && !isSkinTone(cp) && !isRegionalIndicator(cp));
/** The characters a keycap stands on. */
const isKeycapBase = (cp: number) => cp === 0x23 || cp === 0x2a || (cp >= 0x30 && cp <= 0x39);
/**
 * A code point that shows nothing, or changes how what is around it shows, as the first of a
 * reaction: controls, white space, format and direction marks, fillers, surrogates and private use.
 */
const isInvisible = (cp: number) =>
    cp <= 0x20 ||
    (cp >= 0x7f && cp <= 0xa0) ||
    cp === 0xad ||
    cp === 0x034f ||
    cp === 0x061c ||
    cp === 0x115f ||
    cp === 0x1160 ||
    cp === 0x180e ||
    (cp >= 0x2000 && cp <= 0x200f) ||
    (cp >= 0x2028 && cp <= 0x202f) ||
    (cp >= 0x205f && cp <= 0x206f) ||
    cp === 0x3000 ||
    cp === 0x3164 ||
    (cp >= 0xd800 && cp <= 0xdfff) ||
    (cp >= 0xe000 && cp <= 0xf8ff) ||
    cp === 0xfeff ||
    cp === 0xffa0 ||
    (cp >= 0xfff0 && cp <= 0xffff) ||
    cp >= 0xf0000;

/** One emoji: a pictograph with its selector and tone, joined to more such by zero-width joiners. */
const isEmojiSequence = (points: readonly number[]): boolean => {
    let i = 0;
    const element = (): boolean => {
        if (i >= points.length || !isPictographic(points[i])) return false;
        const base = points[i];
        i += 1;
        if (i < points.length && isVariationSelector(points[i])) i += 1;
        if (i < points.length && isSkinTone(points[i])) i += 1;
        if (base === BLACK_FLAG && i < points.length && isTag(points[i])) {
            while (i < points.length && isTag(points[i])) i += 1;
            return points[i - 1] === 0xe007f;
        }
        return true;
    };
    if (!element()) return false;
    while (i < points.length) {
        if (!isJoiner(points[i])) return false;
        i += 1;
        if (!element()) return false;
    }
    return true;
};

/**
 * Whether `value` is one visible character as a person sees it — one emoji, however many code points it
 * is built of, or one precomposed letter with at most two combining marks — at most
 * `REACTION_LIMIT` long. Written out rather than with `Intl.Segmenter`, which the app's
 * JavaScript engine does not have. An emoji is a pictograph with its variation selector and skin tone,
 * pictographs joined by zero-width joiners, a flag (two regional indicators, or a black flag spelled with
 * tags), or a keycap. Two emoji, a word — joiners between letters included — invisible and direction
 * characters, and anything that does not start a character fail.
 */
export const isOneReactionCharacter = (value: string): boolean => {
    if (value.length === 0 || value.length > REACTION_LIMIT) return false;
    const points = Array.from(value, ch => ch.codePointAt(0) ?? 0);
    const first = points[0];
    if (isInvisible(first)) return false;
    if (isRegionalIndicator(first)) return points.length === 2 && isRegionalIndicator(points[1]);
    if (isKeycapBase(first) && points.length > 1) {
        return (
            (points.length === 2 && isKeycap(points[1])) ||
            (points.length === 3 && isVariationSelector(points[1]) && isKeycap(points[2]))
        );
    }
    if (isPictographic(first)) return isEmojiSequence(points);
    if (isCombiningMark(first) || isVariationSelector(first) || isSkinTone(first) || isJoiner(first)) return false;
    return points.length <= 3 && points.slice(1).every(isCombiningMark);
};
