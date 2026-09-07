import { useState } from 'react';

import { cn } from '@chatic/lib/utils';

import { useBuilderStore } from '../../store';
import { TEMPLATES } from './templates';

/**
 * The three event kinds DoU sends, as starting points.
 *
 * Picking one replaces the message. That is an ordinary edit, so undo takes it
 * back — which is why it asks nothing first, even though it discards work.
 */
export const TemplateList = () => {
    const [active, setActive] = useState<string | null>(null);
    const setBlocks = useBuilderStore(state => state.setBlocks);

    return (
        <ul className="flex flex-col gap-0.5 px-2">
            {TEMPLATES.map(template => (
                <li key={template.id}>
                    <button
                        type="button"
                        aria-pressed={active === template.id}
                        onClick={() => {
                            setBlocks(template.blocks);
                            setActive(template.id);
                        }}
                        className={cn(
                            'focus-ring tactile flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
                            'text-caption transition-colors ease-tactile hover:bg-accent',
                            // Bold marks the current pick, per the design note. It is not
                            // a filter — the message keeps changing after it is chosen —
                            // so it fades to normal weight as soon as another is picked.
                            active === template.id ? 'font-semibold text-foreground' : 'text-muted-foreground'
                        )}
                    >
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', template.dotClass)} />
                        {template.label}
                    </button>
                </li>
            ))}
        </ul>
    );
};
