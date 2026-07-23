import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { IconChevronDown } from '../../resources/icons';
import { SectionHeader } from './SectionHeader';

export interface CollapsibleSectionProps {
    /** Section title (e.g. "Place", "Chat"). */
    title: string;
    /** Optional accent count next to the title. */
    count?: number;
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
 */
export const CollapsibleSection = ({
    title,
    count,
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
        <section className={cn('flex w-full flex-col', className)}>
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
        </section>
    );
};
