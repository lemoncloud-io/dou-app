import { useContext, type CSSProperties, type ReactNode } from 'react';

import { cn } from '@chatic/ui-kit';

import {
    BlockKitLabelsContext,
    DEFAULT_BLOCK_KIT_LABELS,
    useBlockKitLabels,
    type BlockKitLabels,
} from './blockKitLabels';
import { decodeSlackEntities, hasDrawableBlocks, type BlockTextObject, type KnownBlock } from './blockKit';
import {
    BLOCK_KIT_SCALE,
    BlockKitScaleContext,
    useBlockKitScale,
    type BlockKitScale,
    type BlockKitScaleClasses,
} from './blockKitScale';
import { MSG_CODE_BLOCK_CLASS } from './messageClasses';
import { resolveCardAccent, type CardAccent } from './cardAccent';
import { BLOCK_KIT_LINK_COLOR_CLASS, BlockKitLinkContext, renderMrkdwn } from './renderMrkdwn';
import { isWebUrl } from './sourceLink';

const TEXT_FLOW = 'whitespace-pre-wrap';

const textOf = (text: BlockTextObject): ReactNode =>
    text.type === 'mrkdwn' ? renderMrkdwn(text.text) : decodeSlackEntities(text.text);

const BODY_CLASS = 'font-medium text-label';

const Header = ({ text, level }: { text: BlockTextObject; level?: number }) => {
    const scale = useBlockKitScale();
    const depth = Math.min(Math.max(level ?? 1, 1), 4);
    const Tag = `h${depth}` as 'h1' | 'h2' | 'h3' | 'h4';
    return <Tag className={cn('text-foreground', TEXT_FLOW, scale.heading[depth - 1])}>{textOf(text)}</Tag>;
};

const SourceLink = ({ url }: { url: string }) => {
    const onLinkClick = useContext(BlockKitLinkContext);
    const labels = useBlockKitLabels();
    const scale = useBlockKitScale();
    return (
        <a
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className={cn(
                'focus-ring w-fit rounded font-semibold underline-offset-2 hover:underline',
                BLOCK_KIT_LINK_COLOR_CLASS,
                scale.context
            )}
            onClick={
                onLinkClick &&
                (event => {
                    event.preventDefault();
                    onLinkClick(url);
                })
            }
        >
            {labels.openSource}
        </a>
    );
};

export const cardBadgeText = (key: unknown): string | null => {
    if (typeof key !== 'string') return null;
    const words = key.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    return words || null;
};

const Badge = ({ text, accented }: { text: string; accented: boolean }) => {
    const scale = useBlockKitScale();
    return (
        <span
            className={cn(
                'inline-flex min-w-0 max-w-full self-start rounded-full px-2.5 py-1 font-bold uppercase',
                scale.badge,
                accented
                    ? 'bg-[var(--block-kit-badge-bg)] text-[color:var(--block-kit-badge-text)]'
                    : 'bg-well text-label'
            )}
        >
            <span className="truncate">{text}</span>
        </span>
    );
};

const accentStyle = (accent: CardAccent): CSSProperties =>
    ({
        '--block-kit-link-light': accent.light.link,
        '--block-kit-link-dark': accent.dark.link,
        '--block-kit-badge-text-light': accent.light.badgeText,
        '--block-kit-badge-text-dark': accent.dark.badgeText,
        '--block-kit-badge-bg-light': accent.light.badgeBackground,
        '--block-kit-badge-bg-dark': accent.dark.badgeBackground,
    }) as CSSProperties;

const ACCENT_CLASS = cn(
    '[--block-kit-link:var(--block-kit-link-light)] dark:[--block-kit-link:var(--block-kit-link-dark)]',
    '[--block-kit-badge-text:var(--block-kit-badge-text-light)] dark:[--block-kit-badge-text:var(--block-kit-badge-text-dark)]',
    '[--block-kit-badge-bg:var(--block-kit-badge-bg-light)] dark:[--block-kit-badge-bg:var(--block-kit-badge-bg-dark)]'
);

const FIELD_LABEL = /^\*([^*\n]+)\*\n/;
const FIELD_FIT = 'min-w-0 max-w-full [overflow-wrap:anywhere]';

const Field = ({ field }: { field: BlockTextObject }): ReactNode => {
    const scale = useBlockKitScale();
    const label = field.type === 'mrkdwn' ? FIELD_LABEL.exec(field.text) : null;
    if (!label) return <span className={cn(BODY_CLASS, scale.body, FIELD_FIT)}>{textOf(field)}</span>;
    return (
        <span className={cn('flex flex-col gap-0.5', FIELD_FIT)}>
            <span className={cn(scale.fieldLabel, 'font-semibold text-description')}>
                {decodeSlackEntities(label[1])}
            </span>
            <span className={cn(BODY_CLASS, scale.body)}>{renderMrkdwn(field.text.slice(label[0].length))}</span>
        </span>
    );
};

const drawBlock = (block: KnownBlock, key: number, scale: BlockKitScaleClasses): ReactNode => {
    switch (block.type) {
        case 'header':
            return <Header key={key} text={block.text} level={block.level} />;
        case 'divider':
            return <hr key={key} className="max-w-2xl border-hairline" />;
        case 'section':
            return (
                <div key={key} className="flex flex-col gap-2">
                    {block.text && <span className={cn(BODY_CLASS, scale.body, TEXT_FLOW)}>{textOf(block.text)}</span>}
                    {block.fields && (
                        <div className={cn('flex max-w-2xl flex-wrap gap-x-12 gap-y-2', TEXT_FLOW)}>
                            {block.fields.map((field, i) => (
                                <Field key={i} field={field} />
                            ))}
                        </div>
                    )}
                </div>
            );
        case 'context':
            return (
                <div key={key} className={cn(scale.context, 'font-medium text-description', TEXT_FLOW)}>
                    {block.elements.map((element, i) => (
                        <span key={i}>
                            {i > 0 && ' '}
                            {textOf(element)}
                        </span>
                    ))}
                </div>
            );
        default:
            return (
                <div key={key} className="flex max-w-2xl flex-col gap-1">
                    <span className="text-overline uppercase text-muted-foreground">
                        {`unsupported block · ${block.raw.match(/"type"\s*:\s*"([^"]+)"/)?.[1] ?? 'unknown'}`}
                    </span>
                    <span className={cn(MSG_CODE_BLOCK_CLASS, 'my-0 text-muted-foreground')}>{block.raw}</span>
                </div>
            );
    }
};

interface BlockKitMessageProps {
    blocks: KnownBlock[];
    raw: string;
    renderFallback?: (raw: string) => ReactNode;
    labels?: Partial<BlockKitLabels>;
    onLinkClick?: (url: string) => void;
    scale?: BlockKitScale;
    sourceUrl?: string;
    source?: { key?: unknown; color?: unknown } | null;
}

export const BlockKitMessage = ({
    blocks,
    raw,
    renderFallback,
    labels,
    onLinkClick,
    scale = 'phone',
    sourceUrl,
    source,
}: BlockKitMessageProps): ReactNode => {
    const link = isWebUrl(sourceUrl) ? <SourceLink key="source" url={sourceUrl.trim()} /> : null;
    const drawable = hasDrawableBlocks(blocks);
    const fallback = (
        <p className={cn('select-text break-words text-body text-foreground', TEXT_FLOW)}>
            {renderFallback ? renderFallback(raw) : raw}
        </p>
    );
    if (!drawable && !link) return fallback;
    const classes = BLOCK_KIT_SCALE[scale];
    const badge = cardBadgeText(source?.key);
    const accent = resolveCardAccent(source?.color);
    return (
        <BlockKitLabelsContext.Provider value={{ ...DEFAULT_BLOCK_KIT_LABELS, ...labels }}>
            <BlockKitScaleContext.Provider value={classes}>
                <BlockKitLinkContext.Provider value={onLinkClick}>
                    <div
                        className={cn(
                            'flex select-text flex-col gap-3.5 break-words text-body text-foreground',
                            accent && ACCENT_CLASS
                        )}
                        style={accent ? accentStyle(accent) : undefined}
                    >
                        {badge && <Badge text={badge} accented={!!accent} />}
                        {drawable ? blocks.map((block, i) => drawBlock(block, i, classes)) : fallback}
                        {link}
                    </div>
                </BlockKitLinkContext.Provider>
            </BlockKitScaleContext.Provider>
        </BlockKitLabelsContext.Provider>
    );
};
