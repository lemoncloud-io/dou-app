import type { ReactNode } from 'react';

import { cn } from '@chatic/lib/utils';

import { radioGroupOptions } from '../utils/radioGroup';

interface SegmentedControlProps<T extends string> {
    options: readonly T[];
    value: T;
    onSelect: (option: T) => void;
    getLabel: (option: T) => ReactNode;
    getHint?: (option: T) => ReactNode;
    ariaLabel: string;
}

/**
 * A 36px segmented radio row on `radioGroupOptions`: one tab stop, arrows move
 * and check, Home/End jump. The picked option is the elevated fill with
 * foreground text — hue, weight and ink change together with the unpicked
 * muted rows, so the state never rides on shade alone.
 */
export const SegmentedControl = <T extends string>({
    options,
    value,
    onSelect,
    getLabel,
    getHint,
    ariaLabel,
}: SegmentedControlProps<T>) => {
    const optionProps = radioGroupOptions(options, value, onSelect);
    return (
        <div
            role="radiogroup"
            aria-label={ariaLabel}
            className="flex min-h-9 rounded-lg border border-hairline bg-well p-0.5"
        >
            {options.map(option => {
                const selected = option === value;
                return (
                    <button
                        key={option}
                        type="button"
                        {...optionProps(option)}
                        className={cn(
                            'focus-ring tactile flex-1 rounded-md px-2 py-1.5 transition-colors ease-tactile',
                            selected ? 'bg-elevated text-foreground shadow-raised' : 'hover:text-foreground'
                        )}
                    >
                        <span
                            className={cn(
                                'block text-caption',
                                selected ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'
                            )}
                        >
                            {getLabel(option)}
                        </span>
                        {getHint && (
                            <span className="block text-nano text-muted-foreground">{getHint(option)}</span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};
