import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { SectionHeader } from '../section/SectionHeader';

export interface ListSectionProps {
    title: string;
    count?: number;
    actions?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
}

export const ListSection = ({ title, count, actions, children, className }: ListSectionProps) => {
    return (
        <section className={cn('flex w-full flex-col gap-2', className)}>
            <SectionHeader title={title} count={count} actions={actions} />
            <div className="flex flex-col">{children}</div>
        </section>
    );
};
