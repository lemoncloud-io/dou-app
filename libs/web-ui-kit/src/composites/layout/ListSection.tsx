import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { SectionHeader } from '../section/SectionHeader';

export interface ListSectionProps {
    /** Section title (e.g. "Place", "Chat"). */
    title: string;
    /** Optional accent count next to the title. */
    count?: number;
    /** Right-aligned header actions (chevron, add button, ...). */
    actions?: React.ReactNode;
    /** Rows composed into the section (e.g. ListRow items). */
    children: React.ReactNode;
    className?: string;
}

/**
 * List section layout — a SectionHeader over a stack of rows. Used to compose the
 * home Place / Chat sections (and any titled list) from design-system rows rather
 * than authoring a bespoke section component.
 */
export const ListSection = ({ title, count, actions, children, className }: ListSectionProps) => {
    return (
        <section className={cn('flex w-full flex-col gap-2', className)}>
            <SectionHeader title={title} count={count} actions={actions} />
            <div className="flex flex-col">{children}</div>
        </section>
    );
};
