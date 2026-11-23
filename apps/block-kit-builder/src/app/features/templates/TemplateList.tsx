import { useState } from 'react';

import { cn } from '@chatic/ui-kit';

import { useBuilderStore } from '../../store';
import { TEMPLATES } from './templates';

export const TemplateList = () => {
    const [active, setActive] = useState<string | null>(null);
    const setBlocks = useBuilderStore(state => state.setBlocks);

    return (
        <ul className="flex flex-col px-2">
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
                            'focus-ring tactile flex w-full items-center gap-2 rounded-md px-2 py-2.5 text-left lg:py-2',
                            'text-caption transition-colors ease-tactile hover:bg-accent',
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
