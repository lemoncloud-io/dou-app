import { useEffect, useRef, useState } from 'react';

import { ChevronDown, ChevronUp, GripVertical, Trash2 } from 'lucide-react';

import { cn } from '@chatic/ui-kit';

import { blockKindOf, describeBlock, useBuilderStore } from '../../store';
import { BlockFields } from './BlockFields';
import { BlockGlyph } from './BlockGlyph';
import { ICON_CONTROL } from './controlStyles';

const ICON_BUTTON = cn(ICON_CONTROL, 'h-8 w-8 lg:h-6 lg:w-6');

export const BlockList = () => {
    const blocks = useBuilderStore(state => state.blocks);
    const dragIndex = useBuilderStore(state => state.dragIndex);
    const [handleHeld, setHandleHeld] = useState(false);
    const { removeBlock, moveBlock, replaceBlock, beginDrag, previewDrag, endDrag } = useBuilderStore.getState();

    const rows = useRef<HTMLLIElement[]>([]);
    const count = useRef(blocks.length);
    useEffect(() => {
        if (blocks.length > count.current) rows.current[blocks.length - 1]?.scrollIntoView({ block: 'nearest' });
        count.current = blocks.length;
    }, [blocks.length]);

    const handles = useRef(new Map<number, HTMLButtonElement>());
    const landing = useRef<number | null>(null);
    useEffect(() => {
        if (landing.current === null) return;
        handles.current.get(landing.current)?.focus();
        landing.current = null;
    });

    if (!blocks.length) {
        return (
            <p className="px-4 py-3 text-caption text-muted-foreground">
                Pick a template above, or add a block to start from nothing.
            </p>
        );
    }

    const release = () => {
        setHandleHeld(false);
        endDrag();
    };

    const nudge = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= blocks.length) return;
        landing.current = target;
        moveBlock(index, direction);
    };

    return (
        <ol className="flex flex-col gap-1.5 px-3 pb-3">
            {blocks.map((block, index) => {
                const kind = blockKindOf(block);
                const name = describeBlock(block);
                const dragging = dragIndex === index;
                const body = <BlockFields block={block} onChange={next => replaceBlock(index, next)} />;

                return (
                    <li
                        key={index}
                        ref={node => {
                            if (node) rows.current[index] = node;
                        }}
                        draggable={handleHeld}
                        onDragStart={() => beginDrag(index)}
                        onDragOver={event => {
                            event.preventDefault();
                            previewDrag(index);
                        }}
                        onDragEnd={release}
                        onDrop={release}
                        className={cn(
                            'group rounded-md border bg-background transition-colors ease-tactile',
                            dragging ? 'border-primary/60 opacity-60 shadow-raised' : 'border-hairline'
                        )}
                    >
                        <div className={cn('flex items-center gap-1.5 px-1.5', body ? 'pt-1.5' : 'py-1')}>
                            <button
                                type="button"
                                ref={node => {
                                    if (node) handles.current.set(index, node);
                                    else handles.current.delete(index);
                                }}
                                aria-label={`Move ${name}. Arrow keys reorder.`}
                                onMouseDown={() => setHandleHeld(true)}
                                onMouseUp={() => setHandleHeld(false)}
                                onKeyDown={event => {
                                    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                                    event.preventDefault();
                                    nudge(index, event.key === 'ArrowUp' ? -1 : 1);
                                }}
                                className={cn(
                                    'focus-ring hidden cursor-grab rounded text-muted-foreground/50 lg:block',
                                    'transition-colors hover:text-muted-foreground active:cursor-grabbing'
                                )}
                            >
                                <GripVertical size={14} />
                            </button>

                            <div className="flex items-center lg:hidden">
                                <button
                                    type="button"
                                    aria-label={`Move ${name} up`}
                                    disabled={index === 0}
                                    className={ICON_BUTTON}
                                    onClick={() => nudge(index, -1)}
                                >
                                    <ChevronUp size={16} />
                                </button>
                                <button
                                    type="button"
                                    aria-label={`Move ${name} down`}
                                    disabled={index === blocks.length - 1}
                                    className={ICON_BUTTON}
                                    onClick={() => nudge(index, 1)}
                                >
                                    <ChevronDown size={16} />
                                </button>
                            </div>

                            <span className="text-muted-foreground/70">{kind ? <BlockGlyph kind={kind} /> : null}</span>
                            <span className="flex-1 truncate text-caption text-muted-foreground">{name}</span>

                            <button
                                type="button"
                                aria-label={`Remove ${name}`}
                                className={cn(
                                    ICON_BUTTON,
                                    'transition-opacity hover:text-destructive lg:opacity-0',
                                    'group-focus-within:opacity-100 group-hover:opacity-100'
                                )}
                                onClick={() => removeBlock(index)}
                            >
                                <Trash2 size={16} className="lg:size-3.5" />
                            </button>
                        </div>

                        {body && <div className="px-1.5 pb-1.5 pt-1">{body}</div>}
                    </li>
                );
            })}
        </ol>
    );
};
