import type { ReactNode } from 'react';

import { ChevronDown } from 'lucide-react';

import { cn } from '@chatic/ui-kit';

import { useSidebarSectionsStore } from '../stores';
import { SortableList, type SortableItem } from './SortableList';

export interface SectionItem extends SortableItem {
    keepWhenCollapsed: boolean;
}

interface SortableSectionProps {
    id: string;
    title: string;
    action?: ReactNode;
    items: SectionItem[];
    emptyLabel?: string;
    dragDisabled?: boolean;
    onReorder?: (orderedKeys: string[]) => void;
}

export const SortableSection = ({
    id,
    title,
    action,
    items,
    emptyLabel,
    dragDisabled,
    onReorder,
}: SortableSectionProps) => {
    const isCollapsed = useSidebarSectionsStore(s => !!s.collapsed[id]);
    const toggle = useSidebarSectionsStore(s => s.toggle);
    const visible = isCollapsed ? items.filter(item => item.keepWhenCollapsed) : items;

    return (
        <section className="flex flex-col gap-1">
            <div className="flex items-center gap-2 py-3">
                <button
                    type="button"
                    onClick={() => toggle(id)}
                    aria-expanded={!isCollapsed}
                    className="focus-ring flex min-w-0 flex-1 items-center gap-2 rounded-md text-left"
                >
                    <h3 className="truncate text-lead font-semibold text-sidebar-foreground">{title}</h3>
                    <ChevronDown
                        size={18}
                        aria-hidden
                        className={cn(
                            'shrink-0 text-sidebar-foreground transition-transform duration-150 ease-tactile',
                            isCollapsed && '-rotate-90'
                        )}
                    />
                </button>
                {action}
            </div>
            {visible.length > 0 && (
                <SortableList
                    items={visible}
                    disabled={!!dragDisabled || isCollapsed}
                    className="flex flex-col gap-2"
                    onReorder={onReorder}
                />
            )}
            {!isCollapsed && items.length === 0 && emptyLabel && (
                <p className="px-2 pb-1 text-caption text-label">{emptyLabel}</p>
            )}
        </section>
    );
};
