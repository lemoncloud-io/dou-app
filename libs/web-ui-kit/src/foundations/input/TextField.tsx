import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconCheck } from '../../resources/icons';

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
    /** Field label rendered above the input. */
    label?: string;
    /** Renders a red asterisk before the label. */
    required?: boolean;
    /** Controlled value. */
    value: string;
    /** Controlled change handler — receives the raw string. */
    onChange: (value: string) => void;
    /** When set, shows an "N/max" counter inside the field and caps input length. */
    maxLength?: number;
    /** Helper text below the field. Hidden when `error` is present. */
    description?: string;
    /** Error text below the field; reddens the border + copy. Overrides `description`. */
    error?: string;
    /** Completed/valid state — greens the border and shows a trailing check. */
    success?: boolean;
}

/**
 * Labeled text field — the design guide's "Input": label (+ optional required
 * mark), a bordered input with an optional character counter, and a
 * description/error line. States: default (focus highlights border), error (red
 * border), success/completed (green border + check).
 */
export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
    (
        {
            label,
            required = false,
            value,
            onChange,
            maxLength,
            description,
            error,
            success = false,
            className,
            id,
            ...props
        },
        ref
    ) => {
        const generatedId = React.useId();
        const inputId = id ?? generatedId;
        const helperText = error ?? description;
        const helperId = `${inputId}-helper`;

        const stateBorder = error
            ? 'border-[1.5px] border-destructive'
            : success
              ? 'border-[1.5px] border-main-accent'
              : 'border-input-border focus-within:border-[1.5px] focus-within:border-focus-border';

        return (
            <div className={cn('flex w-full flex-col gap-2 px-4', className)}>
                <div className="flex w-full flex-col gap-3">
                    {label && (
                        <label
                            htmlFor={inputId}
                            className="text-[14px] font-semibold leading-[18px] tracking-[0.07px] text-label"
                        >
                            {required && (
                                <span className="text-destructive" aria-hidden>
                                    *
                                </span>
                            )}
                            {label}
                        </label>
                    )}

                    <div
                        className={cn(
                            'flex w-full items-center gap-1 rounded-[10px] border bg-surface p-3 transition-colors',
                            stateBorder
                        )}
                    >
                        <input
                            {...props}
                            ref={ref}
                            id={inputId}
                            value={value}
                            maxLength={maxLength}
                            required={required}
                            aria-required={required || undefined}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={helperText ? helperId : undefined}
                            onChange={event => onChange(event.target.value)}
                            className="min-w-0 flex-1 bg-transparent px-1 text-[16px] font-medium leading-[1.45] text-foreground outline-none placeholder:text-placeholder"
                        />
                        {maxLength != null && (
                            <span className="shrink-0 px-1 text-[13px] font-medium leading-[1.385] tracking-[0.25px] text-label/[0.74]">
                                {value.length}/{maxLength}
                            </span>
                        )}
                        {success && <IconCheck className="size-[18px] shrink-0 text-main-accent" strokeWidth={2.5} />}
                    </div>
                </div>

                {helperText && (
                    <p
                        id={helperId}
                        className={cn(
                            'pl-0.5 text-[12px] leading-[18px]',
                            error ? 'text-destructive' : success ? 'text-main-accent' : 'text-description'
                        )}
                    >
                        {helperText}
                    </p>
                )}
            </div>
        );
    }
);
TextField.displayName = 'TextField';
