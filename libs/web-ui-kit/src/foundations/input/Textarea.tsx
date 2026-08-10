import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
    /** Field label rendered above the box. */
    label?: string;
    /** Renders a red asterisk before the label. */
    required?: boolean;
    /** Controlled value. */
    value: string;
    /** Controlled change handler — receives the raw string. */
    onChange: (value: string) => void;
    /** Helper text below the field. Hidden when `error` is present. */
    description?: string;
    /** Error text below the field; reddens the border + copy. Overrides `description`. */
    error?: string;
    /** Box height in px. Defaults to the Figma 198px. */
    height?: number;
    className?: string;
}

/**
 * Labeled multi-line field — the Textarea counterpart of `TextField`: label (+
 * optional required mark), a bordered box that grows a scrollbar instead of
 * resizing, and a description/error line. States: default (focus highlights the
 * border), error (red border).
 *
 * Deliberately has no character counter. `TextField` renders one whenever
 * `maxLength` is set, which is wrong for long-form input where a visible cap
 * reads as pressure; callers that need a hard cap clamp in `onChange`. Add an
 * opt-in counter prop the day a screen actually wants one.
 */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ label, required = false, value, onChange, description, error, height = 198, className, id, ...props }, ref) => {
        const generatedId = React.useId();
        const textareaId = id ?? generatedId;
        const helperText = error ?? description;
        const helperId = `${textareaId}-helper`;

        return (
            <div className={cn('flex w-full flex-col gap-2 px-4', className)}>
                <div className="flex w-full flex-col gap-3">
                    {label && (
                        <label
                            htmlFor={textareaId}
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
                            'flex w-full rounded-[24px] border bg-surface px-5 py-4 transition-colors',
                            error
                                ? 'border-[1.5px] border-destructive'
                                : 'border-input-border focus-within:border-[1.5px] focus-within:border-focus-border'
                        )}
                        style={{ height }}
                    >
                        <textarea
                            {...props}
                            ref={ref}
                            id={textareaId}
                            value={value}
                            required={required}
                            aria-required={required || undefined}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={helperText ? helperId : undefined}
                            onChange={event => onChange(event.target.value)}
                            className="h-full w-full resize-none bg-transparent text-[14px] font-medium leading-[1.45] tracking-[-0.07px] text-foreground outline-none placeholder:text-placeholder"
                        />
                    </div>
                </div>

                {helperText && (
                    <p
                        id={helperId}
                        className={cn(
                            'pl-0.5 text-[12px] leading-[18px]',
                            error ? 'text-destructive' : 'text-description'
                        )}
                    >
                        {helperText}
                    </p>
                )}
            </div>
        );
    }
);
Textarea.displayName = 'Textarea';
