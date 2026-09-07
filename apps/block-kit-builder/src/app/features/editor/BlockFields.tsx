import type { BlockTextObject, KnownBlock } from '@chatic/block-kit';
import { cn } from '@chatic/lib/utils';

const INPUT = cn(
    'focus-ring w-full rounded-md border border-hairline bg-background px-2 py-1.5',
    'font-mono text-caption leading-relaxed text-foreground'
);

const text = (value: string, type: BlockTextObject['type']): BlockTextObject => ({ type, text: value });

interface TextInputProps {
    label: string;
    value: string;
    rows: number;
    onValue: (value: string) => void;
}

/**
 * One text object.
 *
 * A textarea rather than an input everywhere: newlines are significant in every
 * Slack text object — a grid cell is routinely `*Label*\nvalue` — so a control
 * that swallowed Enter would put half the contract out of reach.
 */
const TextInput = ({ label, value, rows, onValue }: TextInputProps) => (
    <textarea
        aria-label={label}
        className={INPUT}
        rows={rows}
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
                rows={2}
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
                    rows={2}
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
                    rows={3}
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
