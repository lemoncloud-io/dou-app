/**
 * Steps an index through a list that loops: past the last item comes the first, before the first
 * comes the last. The carousel arrows never run out, so neither does this.
 */
export const wrapIndex = (current: number, delta: number, length: number): number => {
    if (length <= 0) return 0;
    return (((current + delta) % length) + length) % length;
};
