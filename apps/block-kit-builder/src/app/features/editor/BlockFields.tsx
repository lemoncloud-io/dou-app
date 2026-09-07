import { useLayoutEffect, useRef } from 'react';

import type { BlockTextObject, KnownBlock } from '@chatic/block-kit';
import { cn } from '@chatic/lib/utils';

// 16px on a phone, the design size once there is a pointer: iOS Safari zooms the
// page when a focused field's text is smaller than 16px, and it does not zoom back.
// No border: the card already draws one, and a box inside a box reads as two
// things when it is one. The well is what separates the field from the card.
// No resize handle either — the field sizes itself.
const INPUT = cn(
    'focus-ring block w-full resize-none overflow-hidden rounded bg-well px-2 py-1.5',
    'font-mono text-[16px] leading-relaxed text-foreground lg:text-caption'
);

/**
 * Tall enough for what is in it.
 *
 * A stack trace and a one-word label are both legitimate contents of the same
 * field, so any fixed height is wrong for one of them — and a clipped field in a
 * tool whose whole job is showing you what you wrote is the wrong thing to clip.
 * Capped, because a rail that scrolls past the message it is editing is no better.
 */
const MAX_HEIGHT = 220;

const useAutoHeight = (value: string) => {
    const ref = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        const node = ref.current;
        if (!node) return;
        node.style.height = 'auto';
        node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT)}px`;
        node.style.overflowY = node.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
    }, [value]);
    return ref;
};

const text = (value: string, type: BlockTextObject['type']): BlockTextObject => ({ type, text: value });

interface TextInputProps {
    label: string;
    value: string;
    onValue: (value: string) => void;
}

/**
 * One text object.
 *
 * A textarea rather than an input everywhere: newlines are significant in every
 * Slack text object — a grid cell is routinely `*Label*\nvalue` — so a control
 * that swallowed Enter would put half the contract out of reach.
 */
const TextInput = ({ label, value, onValue }: TextInputProps) => (
    <textarea
        ref={useAutoHeight(value)}
        aria-label={label}
        className={INPUT}
        rows={1}
        value={value}
        onChange={event => onValue(event.target.value)}
    />
);

interface TextListProps {
    label: string;
    items: BlockTextObject[];
    onItems: (items: BlockTextObject[]) => void;
}

/** A block's repeated text objects — `section.fields` and `context.elements`. */
const TextList = ({ label, items, onItems }: TextListProps) => (
    <div className="flex flex-col gap-1">
        {items.map((item, index) => (
            <TextInput
                key={index}
                label={`${label} ${index + 1}`}
                value={item.text}
                onValue={value => onItems(items.map((current, i) => (i === index ? text(value, 'mrkdwn') : current)))}
            />
        ))}
    </div>
);

interface BlockFieldsProps {
    block: KnownBlock;
    onChange: (block: KnownBlock) => void;
}

/** The inputs for one block. A divider has none; an undrawable block shows its source. */
export const BlockFields = ({ block, onChange }: BlockFieldsProps) => {
    switch (block.type) {
        case 'header':
            return (
                <TextInput
                    label="Header text"
                    value={block.text.text}
                    onValue={value => onChange({ ...block, text: text(value, 'plain_text') })}
                />
            );

        case 'section':
            return block.fields?.length ? (
                <TextList label="Field" items={block.fields} onItems={fields => onChange({ ...block, fields })} />
            ) : (
                <TextInput
                    label="Section text"
                    value={block.text?.text ?? ''}
                    onValue={value => onChange({ ...block, text: text(value, 'mrkdwn') })}
                />
            );

        case 'context':
            return (
                <TextList
                    label="Context"
                    items={block.elements}
                    onItems={elements => onChange({ ...block, elements })}
                />
            );

        case 'divider':
            return null;

        default:
            // Arrived through the payload editor as something the renderer cannot
            // draw. Editing it here would need a schema we do not have.
            return <p className="break-all font-mono text-micro text-muted-foreground">{block.raw}</p>;
    }
};
