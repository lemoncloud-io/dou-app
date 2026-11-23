import type { KeyboardEvent } from 'react';

const targetIndex = (key: string, from: number, count: number): number | null => {
    switch (key) {
        case 'ArrowRight':
        case 'ArrowDown':
            return (from + 1) % count;
        case 'ArrowLeft':
        case 'ArrowUp':
            return (from - 1 + count) % count;
        case 'Home':
            return 0;
        case 'End':
            return count - 1;
        default:
            return null;
    }
};

export const radioGroupOptions = <T>(options: readonly T[], value: unknown, onSelect: (option: T) => void) => {
    const tabStop = options.find(option => option === value) ?? options[0];

    return (option: T) => ({
        role: 'radio' as const,
        'aria-checked': option === value,
        tabIndex: option === tabStop ? 0 : -1,
        onClick: () => onSelect(option),
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            const to = targetIndex(event.key, options.indexOf(option), options.length);
            if (to === null) return;
            event.preventDefault();
            onSelect(options[to]);
            const radios = event.currentTarget
                .closest('[role="radiogroup"]')
                ?.querySelectorAll<HTMLElement>('[role="radio"]');
            radios?.[to]?.focus();
        },
    });
};
