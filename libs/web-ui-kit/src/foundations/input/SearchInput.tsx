import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconSearch } from '../../resources/icons';

export interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
    /** Controlled value. */
    value: string;
    /** Controlled change handler — receives the raw string. */
    onChange: (value: string) => void;
    placeholder?: string;
    /** Optional adjacent action rendered to the right (e.g. an invite-link button). */
    trailing?: React.ReactNode;
    /** Accessible label for the input. Host supplies a localized string. */
    label?: string;
    className?: string;
}

/**
 * Pill search field — the Figma "Search" container. A rounded, filled input with
 * a leading magnifier. An optional `trailing` slot sits beside it for a sibling
 * action button (e.g. the friend-picker's invite-link button).
 */
export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
    ({ value, onChange, placeholder = '검색', trailing, label, className, ...props }, ref) => {
        return (
            <div className={cn('flex w-full items-center gap-2', className)}>
                <div className="flex h-11 flex-1 items-center gap-0.5 rounded-full bg-secondary px-4">
                    <IconSearch className="size-5 shrink-0 text-foreground" strokeWidth={2} />
                    <input
                        {...props}
                        ref={ref}
                        type="search"
                        value={value}
                        placeholder={placeholder}
                        aria-label={label}
                        onChange={event => onChange(event.target.value)}
                        className="min-w-0 flex-1 bg-transparent px-2 text-[16px] font-medium tracking-[-0.08px] text-foreground outline-none placeholder:text-description [&::-webkit-search-cancel-button]:appearance-none"
                    />
                </div>
                {trailing}
            </div>
        );
    }
);
SearchInput.displayName = 'SearchInput';
