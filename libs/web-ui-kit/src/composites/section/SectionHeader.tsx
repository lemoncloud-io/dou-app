import * as React from 'react';

import { cn } from '@chatic/lib/utils';

export interface SectionHeaderProps {
    /** Section title (e.g. "Place", "Chat", "친구 선택"). */
    title: string;
    /**
     * Optional count shown next to the title, in the same colour as the title.
     *
     * It used to render in accent green (ADR-0014); the current design renders it as plain
     * foreground (Figma 3486-26403 uses #0c1014), and every consumer moved with it — see ADR-0034.
     */
    count?: number;
    /** Right-aligned actions (icon buttons, chevrons, ...). */
    actions?: React.ReactNode;
    className?: string;
}

/**
 * List section header — the Figma "Heading 2" row used above the Place/Chat and
 * friend-picker lists: a bold title with an optional accent count and a slot for
 * right-aligned actions.
 */
export const SectionHeader = ({ title, count, actions, className }: SectionHeaderProps) => {
    return (
        <div className={cn('flex h-11 w-full items-center justify-between px-4', className)}>
            <div className="flex items-center gap-1">
                <span className="text-[18px] font-semibold leading-[25px] tracking-[-0.09px] text-foreground">
                    {title}
                </span>
                {count != null && (
                    <span className="text-[18px] font-semibold leading-[25px] text-foreground">{count}</span>
                )}
            </div>
            {actions && <div className="flex items-center gap-3">{actions}</div>}
        </div>
    );
};
