import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { IconChevronDown } from '../../resources/icons';
import { SectionHeader } from './SectionHeader';

export interface CollapsibleSectionProps {
    title: string;
    count?: number;
    description?: string;
    footer?: React.ReactNode;
    actions?: React.ReactNode;
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    toggleLabel?: string;
    children: React.ReactNode;
    className?: string;
}

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

    const [isBodyMounted, setIsBodyMounted] = React.useState(isOpen);
    React.useEffect(() => {
        if (isOpen) setIsBodyMounted(true);
    }, [isOpen]);

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
        <section className={cn('flex w-full shrink-0 flex-col', className)}>
            <SectionHeader
                title={title}
                count={count}
                onClick={toggle}
                actions={
                    <>
                        {actions}
                        {chevron}
                    </>
                }
            />
            {description && (
                <p className="px-4 pb-2 text-[14px] leading-[1.4] tracking-[-0.01em] text-description">{description}</p>
            )}
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
