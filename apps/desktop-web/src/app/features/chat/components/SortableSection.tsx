import type { ReactNode } from 'react';

import { ChevronDown } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

import { useSidebarSectionsStore } from '../stores';
import { SortableList, type SortableItem } from './SortableList';

/** A section row. Its `key` is `<section prefix>:<channel id>`. */
export interface SectionItem extends SortableItem {
    /** Stays visible while the section is folded: the open channel, or one with unread. */
    keepWhenCollapsed: boolean;
}

interface SortableSectionProps {
    /** Persisted fold key (`useSidebarSectionsStore`). */
    id: string;
    title: string;
    /** Trailing control in the header row (the Channels "+"). */
    action?: ReactNode;
    items: SectionItem[];
    /** Line drawn under the heading while the section has no rows (hidden while folded). */
    emptyLabel?: string;
    /** Rows are not draggable while the section is folded or the list is filtered —
     *  a reordered subset would write a partial order. */
    dragDisabled?: boolean;
    /** Called with the reordered item keys after a drag. Never on a plain click. */
    onReorder?: (orderedKeys: string[]) => void;
}

/**
 * Collapsible, drag-reorderable sidebar section (Figma: 16px semibold title · trailing chevron ·
 * optional action at the far end). An empty section says so in one line rather than leaving a
 * bare heading. One `DndContext` per section, so a cross-section drop is impossible by
 * construction (decided: cross-section drop would imply favorite semantics).
 *
 * Folding hides the quiet rows, not the ones asking for attention: like Slack, the open
 * channel and anything unread stay listed, so folding a busy section never hides that
 * something arrived. The fold is remembered across launches.
 */
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
