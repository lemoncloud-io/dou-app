import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconChevronRight, IconClose } from '../../resources/icons';

export interface PromoBannerProps {
    /** Leading illustration, rendered in a fixed 48px square. */
    icon?: React.ReactNode;
    /** Banner copy. `\n` is honoured, so hosts can pass a two-line localized string. */
    title: string;
    /** Inline action link label; rendered only together with `onAction`. */
    actionLabel?: string;
    onAction?: () => void;
    /** Dismiss (X) button; rendered only when supplied. */
    onDismiss?: () => void;
    /** Accessible label for the dismiss button. Host supplies a localized string. */
    dismissLabel?: string;
    className?: string;
}

/**
 * Promotional banner — the Figma "클라우드 추가_Banner" (3506:27156): a tinted rounded card with a
 * leading illustration, two lines of copy, an optional inline action link, and an optional dismiss.
 *
 * Both the link and the dismiss are opt-in so one component covers the two placements in the app:
 * the relay home uses both, the cloud switcher sheet uses dismiss only (it already has its own
 * "add cloud" button).
 */
export const PromoBanner = ({
    icon,
    title,
    actionLabel,
    onAction,
    onDismiss,
    dismissLabel = 'Dismiss',
    className,
}: PromoBannerProps) => {
    return (
        <div className={cn('flex w-full items-center justify-between rounded-2xl bg-secondary p-4', className)}>
            <div className="flex min-w-0 flex-1 items-center gap-2">
                {icon && <span className="flex size-12 shrink-0 items-center justify-center">{icon}</span>}
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
                    <p className="whitespace-pre-line break-words text-[15px] font-semibold leading-[1.44] tracking-[-0.075px] text-foreground">
                        {title}
                    </p>
                    {actionLabel && onAction && (
                        <button
                            type="button"
                            onClick={onAction}
                            className="flex min-w-0 items-center gap-1 self-start py-0.5 text-[14px] font-medium leading-[1.4] tracking-[-0.07px] text-point-blue"
                        >
                            <span className="truncate">{actionLabel}</span>
                            <IconChevronRight className="size-[18px]" />
                        </button>
                    )}
                </div>
            </div>
            {onDismiss && (
                <button
                    type="button"
                    onClick={onDismiss}
                    aria-label={dismissLabel}
                    // size-6 wrapper around the 18px glyph: a 24px minimum tap target, same shape
                    // as BottomSheet's close and CollapsibleSection's chevron.
                    className="ml-2 flex size-6 shrink-0 items-center justify-center text-label"
                >
                    <IconClose className="size-[18px]" />
                </button>
            )}
        </div>
    );
};
