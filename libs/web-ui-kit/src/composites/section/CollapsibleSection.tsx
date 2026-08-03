import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconChevronDown } from '../../resources/icons';
import { SectionHeader } from './SectionHeader';

export interface CollapsibleSectionProps {
    /** Section title (e.g. "Place", "Chat"). */
    title: string;
    /** Optional count next to the title. */
    count?: number;
    /**
     * Sub-caption under the title. Part of the HEADER, not the body — it stays visible while the
     * section is collapsed (the cloud switcher relies on this, Figma 3486-25889).
     */
    description?: string;
    /**
     * Pinned area below the body and OUTSIDE the collapsible region, so it stays visible while the
     * section is collapsed (e.g. the switcher's "add cloud" button).
     */
    footer?: React.ReactNode;
    /** Extra actions rendered to the left of the collapse chevron (e.g. a create button). */
    actions?: React.ReactNode;
    /** Controlled open state; pair with `onOpenChange`. Omit for uncontrolled. */
    open?: boolean;
    /** Uncontrolled initial open state. Defaults to open. */
    defaultOpen?: boolean;
    /** Fires with the next open state on every toggle (both controlled and uncontrolled). */
    onOpenChange?: (open: boolean) => void;
    /** Accessible label for the collapse toggle. Host supplies a localized string. */
    toggleLabel?: string;
    /** Section body — hidden (unmounted) while collapsed. */
    children: React.ReactNode;
    className?: string;
}

/**
 * Collapsible list section — a SectionHeader whose trailing chevron toggles the
 * body open/closed, used for the home Place / Chat sections. Supports controlled
 * (`open` + `onOpenChange`) and uncontrolled (`defaultOpen`) use; the chevron
 * rotates and the body height eases open/closed. Expanding mounts the body
 * immediately; collapsing keeps it mounted through the animation and then
 * unmounts it so nested rows unregister their sync while hidden.
 *
 * Only `children` collapses. `description` and `footer` sit outside the animated
 * region and stay visible in either state.
 */
export const CollapsibleSection = ({
    title,
    count,
    description,
    footer,
    actions,
    open,
    defaultOpen = true,
    onOpenChange,
    toggleLabel = 'Toggle section',
    children,
    className,
}: CollapsibleSectionProps) => {
    const isControlled = open !== undefined;
    const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
    const isOpen = isControlled ? open : internalOpen;

    // Body stays mounted while open and throughout a collapse animation, then unmounts once
    // the height transition ends — preserving the "unregister sync when hidden" contract.
    const [isBodyMounted, setIsBodyMounted] = React.useState(isOpen);
    React.useEffect(() => {
        if (isOpen) setIsBodyMounted(true);
    }, [isOpen]);

    // Unmount only after this wrapper's own height transition finishes; ignore transitions
    // that bubble up from child rows (target !== the grid wrapper).
    const handleBodyTransitionEnd = (event: React.TransitionEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget && !isOpen) setIsBodyMounted(false);
    };

    const toggle = () => {
        const next = !isOpen;
        if (!isControlled) setInternalOpen(next);
        onOpenChange?.(next);
    };

    const chevron = (
        <button
            type="button"
            onClick={toggle}
            aria-label={toggleLabel}
            aria-expanded={isOpen}
            className="flex size-6 items-center justify-center"
        >
            <IconChevronDown
                className={cn('size-[18px] text-foreground transition-transform', !isOpen && '-rotate-90')}
            />
        </button>
    );

    return (
        // shrink-0: this section is used as a flex item inside column scroll containers (home), and
        // its body wrapper below is `overflow-hidden` — a shape where engines have historically
        // disagreed about the automatic minimum size. Chrome keeps the content height either way;
        // pinning shrink to 0 states the intent (a list section never shrinks) so a long list can
        // only overflow the scroller, never get clipped.
        <section className={cn('flex w-full shrink-0 flex-col', className)}>
            <SectionHeader
                title={title}
                count={count}
                actions={
                    <>
                        {actions}
                        {chevron}
                    </>
                }
            />
            {/* Header sub-caption — deliberately outside the collapsible region below. */}
            {description && (
                <p className="px-4 pb-2 text-[14px] leading-[1.4] tracking-[-0.01em] text-description">{description}</p>
            )}
            {/* Animate height via a 0fr↔1fr grid row so expand/collapse eases instead of
                snapping; the inner wrapper clips the body while the row-track transitions. */}
            <div
                className={cn(
                    'grid transition-[grid-template-rows] duration-200 ease-out',
                    isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                )}
                onTransitionEnd={handleBodyTransitionEnd}
            >
                <div className="min-h-0 overflow-hidden">
                    {isBodyMounted && <div className="flex flex-col">{children}</div>}
                </div>
            </div>
            {footer}
        </section>
    );
};
