import type { KeyboardEvent } from 'react';

/** Where a key moves within `count` options from index `from`, or null when it is not a move key. */
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

/**
 * Props for the options of a `role="radiogroup"` drawn as buttons. A radio group is one tab stop —
 * Tab lands on the checked option and leaves the group — and the arrow keys move between options,
 * checking each as they reach it (wrapping at the ends; Home and End jump to them). Buttons alone
 * gave every option its own tab stop and no arrows at all.
 *
 * Focus moves by the group's DOM order, so `options` must be listed in the order they render.
 * `value` is `unknown` rather than `T` because it can be wider than the options — `i18n.language`
 * is any string.
 *
 * ```tsx
 * const optionProps = radioGroupOptions(THEMES, theme, setTheme);
 * <div role="radiogroup">{THEMES.map(o => <button key={o} {...optionProps(o)}>…</button>)}</div>
 * ```
 */
export const radioGroupOptions = <T>(options: readonly T[], value: unknown, onSelect: (option: T) => void) => {
    // Nothing checked (a value outside the list) must not leave the group unreachable by Tab.
    const tabStop = options.find(option => option === value) ?? options[0];

    return (option: T) => ({
        role: 'radio' as const,
        'aria-checked': option === value,
        tabIndex: option === tabStop ? 0 : -1,
        onClick: () => onSelect(option),
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
            // A modified arrow is somebody's shortcut, not a move within the group.
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
