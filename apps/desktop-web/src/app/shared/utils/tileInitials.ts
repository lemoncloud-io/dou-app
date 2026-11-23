import { cloudLabel } from './channelLabel';

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

export const distinctInitials = (names: string[]): string[] => {
    const candidates = names.map(candidatesOf);
    const step = names.map(() => 0);
    const textAt = (index: number) => candidates[index][step[index]] ?? '#';
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
