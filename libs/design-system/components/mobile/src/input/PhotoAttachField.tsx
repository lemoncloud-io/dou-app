import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconClose, IconGalleryAdd } from '@chatic/design-system-assets/icons';

export interface PhotoAttachFieldProps {
    label?: string;
    value: string[];
    onSelect: (files: File[]) => void;
    onRemove: (index: number) => void;
    hint?: React.ReactNode;
    description?: string;
    accept?: string;
    max?: number;
    removeLabel?: (index: number) => string;
    disabled?: boolean;
    className?: string;
}

export const PhotoAttachField = ({
    label,
    value,
    onSelect,
    onRemove,
    hint,
    description,
    accept = 'image/jpeg,image/png',
    max,
    removeLabel = index => `Remove photo ${index}`,
    disabled = false,
    className,
}: PhotoAttachFieldProps) => {
    const inputRef = React.useRef<HTMLInputElement>(null);
    const isFull = max != null && value.length >= max;

    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files ?? []);
        event.target.value = '';
        if (files.length) onSelect(files);
    };

    return (
        <div className={cn('flex w-full flex-col gap-4 px-4', className)}>
            <div className="flex w-full flex-col gap-3">
                {label && (
                    <span className="text-[14px] font-semibold leading-[18px] tracking-[0.07px] text-label">
                        {label}
                    </span>
                )}

                {!isFull && (
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={disabled}
                        className={cn(
                            'flex h-[146px] w-full flex-col items-center justify-center gap-4 rounded-[24px] border border-dashed border-[#DFE0E2] bg-surface px-2 py-6 transition-colors',
                            disabled ? 'opacity-50' : 'hover:border-focus-border'
                        )}
                    >
                        <IconGalleryAdd size={40} className="text-brand-ink" />
                        {hint && (
                            <span className="whitespace-pre-line text-center text-[14px] font-medium leading-[1.4] tracking-[-0.07px] text-label">
                                {hint}
                            </span>
                        )}
                    </button>
                )}

                {value.length > 0 && (
                    <ul className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pt-1.5">
                        {value.map((src, index) => (
                            <li key={`${index}-${src.slice(-24)}`} className="relative shrink-0">
                                <img
                                    src={src}
                                    alt=""
                                    className="size-[88px] rounded-[10px] border border-placeholder object-cover"
                                />
                                <button
                                    type="button"
                                    onClick={() => onRemove(index)}
                                    disabled={disabled}
                                    aria-label={removeLabel(index + 1)}
                                    className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-input-border"
                                >
                                    <IconClose className="size-3 text-label" strokeWidth={2.5} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {description && <p className="pl-0.5 text-[12px] leading-[18px] text-description">{description}</p>}

            <input
                ref={inputRef}
                type="file"
                accept={accept}
                multiple
                onChange={handleChange}
                className="hidden"
                tabIndex={-1}
            />
        </div>
    );
};
