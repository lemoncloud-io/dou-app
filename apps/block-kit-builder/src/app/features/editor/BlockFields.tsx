import type { BlockTextObject, KnownBlock } from '@chatic/block-kit';

import { cn } from '@chatic/lib/utils';

const INPUT = cn(
    'focus-ring w-full rounded-md border border-hairline bg-background px-2 py-1.5',
    'font-mono text-caption leading-relaxed text-foreground'
);

const text = (value: string, type: BlockTextObject['type']): BlockTextObject => ({ type, text: value });

interface BlockFieldsProps {
    block: KnownBlock;
    onChange: (block: KnownBlock) => void;
}

/**
 * The inputs for one block.
 *
 * Every field is a textarea rather than a single-line input: newlines are
 * significant in every Slack text object — a grid cell is routinely
 * `*Label*\nvalue` — so an input that swallowed Enter would make half the
 * contract unreachable.
 */
export const BlockFields = ({ block, onChange }: BlockFieldsProps) => {
    switch (block.type) {
        case 'header':
            return (
                <textarea
                    aria-label="Header text"
                    className={INPUT}
                    rows={2}
                    value={block.text.text}
                    onChange={event => onChange({ ...block, text: text(event.target.value, 'plain_text') })}
                />
            );

        case 'section':
            return block.fields?.length ? (
                <div className="flex flex-col gap-1">
                    {block.fields.map((field, i) => (
                        <textarea
                            key={i}
                            aria-label={`Field ${i + 1}`}
                            className={INPUT}
                            rows={2}
                            value={field.text}
                            onChange={event =>
                                onChange({
                                    ...block,
                                    fields: block.fields?.map((current, j) =>
                                        j === i ? text(event.target.value, 'mrkdwn') : current
                                    ),
                                })
                            }
                        />
                    ))}
                </div>
            ) : (
                <textarea
                    aria-label="Section text"
                    className={INPUT}
                    rows={3}
                    value={block.text?.text ?? ''}
                    onChange={event => onChange({ ...block, text: text(event.target.value, 'mrkdwn') })}
                />
            );

        case 'context':
            return (
                <div className="flex flex-col gap-1">
                    {block.elements.map((element, i) => (
                        <textarea
                            key={i}
                            aria-label={`Context ${i + 1}`}
                            className={INPUT}
                            rows={2}
                            value={element.text}
                            onChange={event =>
                                onChange({
                                    ...block,
                                    elements: block.elements.map((current, j) =>
                                        j === i ? text(event.target.value, 'mrkdwn') : current
                                    ),
                                })
                            }
                        />
                    ))}
                </div>
            );

        case 'divider':
            return null;

        default:
            // Arrived through the payload editor as something the renderer cannot
            // draw. Show the source; editing it here would need a schema we do not have.
            return <p className="break-all font-mono text-micro text-muted-foreground">{block.raw}</p>;
    }
};
