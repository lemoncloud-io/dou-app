import { useLayoutEffect, useRef } from 'react';

import type { BlockTextObject, KnownBlock } from '@chatic/block-kit';
import { cn } from '@chatic/ui-kit';

const INPUT = cn(
    'focus-ring block w-full resize-none overflow-hidden rounded bg-well px-2 py-1.5',
    'font-mono text-[16px] leading-relaxed text-foreground lg:text-caption'
);

const MAX_HEIGHT = 220;

const useAutoHeight = (value: string) => {
    const ref = useRef<HTMLTextAreaElement>(null);

    useLayoutEffect(() => {
        const node = ref.current;
        if (!node) return;

        const fit = () => {
            node.style.height = 'auto';
            node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT)}px`;
            node.style.overflowY = node.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden';
        };
        fit();

        let width = node.clientWidth;
        const observer = new ResizeObserver(() => {
            if (node.clientWidth === width) return;
            width = node.clientWidth;
            fit();
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, [value]);

    return ref;
};

const text = (value: string, type: BlockTextObject['type']): BlockTextObject => ({ type, text: value });

interface TextInputProps {
    label: string;
    value: string;
    onValue: (value: string) => void;
}

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
            return <p className="break-all font-mono text-micro text-muted-foreground">{block.raw}</p>;
    }
};
