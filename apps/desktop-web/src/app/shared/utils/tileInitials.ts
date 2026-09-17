const initialOf = (name: string, length: number): string => {
    const chars = Array.from(name.trim());
    const initial = chars.slice(0, length).join('');
    return length === 1 ? initial.toUpperCase() : initial.charAt(0).toUpperCase() + initial.slice(1);
};

/**
 * Tile text for a rail of named items, one entry per name. One letter each,
 * unless two names share it: then those take two, so "Team" and "Tokyo" read
 * "Te" and "To" instead of two identical "T" tiles with nothing between them.
 */
export const distinctInitials = (names: string[]): string[] => {
    const firsts = names.map(name => initialOf(name, 1));
    return names.map((name, index) => {
        const first = firsts[index] || '#';
        const clashes = firsts.some((other, at) => at !== index && other === first);
        return clashes ? initialOf(name, 2) || first : first;
    });
};
