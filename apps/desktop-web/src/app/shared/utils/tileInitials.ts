import { cloudLabel } from './channelLabel';

/**
 * Tile texts a name can take, most preferred first: its first letter, then that letter with the
 * name's trailing number ("test-lemon2" → "T2"), then its first two letters. A name with no trailing
 * number skips that step.
 */
const candidatesOf = (name: string): string[] => {
    const chars = Array.from(name.trim());
    if (chars.length === 0) return [];
    const first = chars[0].toUpperCase();
    const digits = name.trim().match(/\d+$/)?.[0];
    const candidates = [first];
    if (digits && digits.length < chars.length) candidates.push(first + digits.slice(-2));
    if (chars.length > 1) candidates.push(first + chars[1]);
    return candidates;
};

/**
 * Tile text for a rail of named items, one entry per name. One letter each, unless two names share
 * it: then those step to their next candidate, and again while any still clash. "Team" and "Tokyo"
 * read "Te" and "To"; "test-lemon" and "test-lemon2" read "Te" and "T2" rather than "Te" twice. A
 * name that runs out of candidates keeps its last one; an empty name reads "#".
 */
export const distinctInitials = (names: string[]): string[] => {
    const candidates = names.map(candidatesOf);
    const step = names.map(() => 0);
    const textAt = (index: number) => candidates[index][step[index]] ?? '#';
    // Each pass moves only names that clash and still have a candidate left, so it ends.
    for (let moved = true; moved; ) {
        moved = false;
        const texts = names.map((_, index) => textAt(index));
        texts.forEach((text, index) => {
            const clashes = texts.some((other, at) => at !== index && other === text);
            if (clashes && step[index] < candidates[index].length - 1) {
                step[index] += 1;
                moved = true;
            }
        });
    }
    return names.map((_, index) => textAt(index));
};

/**
 * Label and tile text for each cloud on the rail. An untitled cloud has no letters of its own: its
 * tile used to take them from the fallback label, so every one of them read the same two syllables.
 * It reads "?" instead, and when there are several they are numbered, in the label too.
 */
export const cloudTiles = (
    clouds: Array<{ id: string; name?: string }>,
    untitled: (ordinal?: number) => string
): Array<{ label: string; initial: string }> => {
    const names = clouds.map(cloud => cloudLabel(cloud, ''));
    const untitledCount = names.filter(name => !name).length;
    const initials = distinctInitials(names);
    let ordinal = 0;
    return names.map((name, index) => {
        if (name) return { label: name, initial: initials[index] };
        if (untitledCount === 1) return { label: untitled(), initial: '?' };
        ordinal += 1;
        return { label: untitled(ordinal), initial: `?${ordinal}` };
    });
};
