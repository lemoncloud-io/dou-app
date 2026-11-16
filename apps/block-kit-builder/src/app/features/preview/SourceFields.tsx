import { useId } from 'react';

/**
 * The three message fields the server stores beside a webhook's blocks (`source$`): the sender's
 * channel name, its colour, and the full report's address. They are not part of the Block Kit
 * payload — the server builds them from the send's `meta.channel`, `meta.color` and
 * `meta.sourceUrl` — so they are typed here rather than in the payload pane, and they are preview
 * state only: never persisted, never copied with the payload.
 */
export interface PreviewSource {
    key: string;
    color: string;
    url: string;
}

export const EMPTY_PREVIEW_SOURCE: PreviewSource = { key: '', color: '', url: '' };

/**
 * The `source$` a channel would receive for these inputs, which is what the card is drawn from.
 * Shaped as the server sends it: a blank field is left out, and with every field blank there is no
 * `source$` at all. Values are passed through as typed — trimming and reading them is the
 * renderer's job, exactly as it is for a real message.
 */
export const toCardSource = (source: PreviewSource): { key?: string; color?: string; url?: string } | undefined => {
    const entries = Object.entries(source).filter(([, value]) => value.trim() !== '');
    return entries.length ? Object.fromEntries(entries) : undefined;
};

const FIELDS: { id: keyof PreviewSource; label: string; placeholder: string }[] = [
    { id: 'key', label: 'Channel', placeholder: 'attendance' },
    { id: 'color', label: 'Color', placeholder: 'good · #FFB71B' },
    { id: 'url', label: 'Source URL', placeholder: 'https://…' },
];

interface SourceFieldsProps {
    value: PreviewSource;
    onValue: (source: PreviewSource) => void;
}

export const SourceFields = ({ value, onValue }: SourceFieldsProps) => {
    const base = useId();
    return (
        <fieldset className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <legend className="mb-1.5 text-caption text-muted-foreground">
                Message source (<code>source$</code>) — badge, accent colour and source link
            </legend>
            {FIELDS.map(({ id, label, placeholder }) => (
                <label key={id} htmlFor={`${base}-${id}`} className="flex min-w-0 flex-col gap-1">
                    <span className="text-caption font-semibold text-foreground">{label}</span>
                    <input
                        id={`${base}-${id}`}
                        type="text"
                        spellCheck={false}
                        autoComplete="off"
                        value={value[id]}
                        placeholder={placeholder}
                        onChange={event => onValue({ ...value, [id]: event.target.value })}
                        className="focus-ring h-8 min-w-0 rounded-md border border-hairline bg-background px-2 text-caption text-foreground placeholder:text-muted-foreground"
                    />
                </label>
            ))}
        </fieldset>
    );
};
