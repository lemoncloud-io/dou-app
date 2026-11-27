import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconSearch } from '@chatic/design-system-assets/icons';

export interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    trailing?: React.ReactNode;
    label?: string;
    className?: string;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
    ({ value, onChange, placeholder = 'Search', trailing, label, className, ...props }, ref) => {
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
