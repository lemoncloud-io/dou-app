import { Fragment, createContext, useContext, type ReactNode } from 'react';

import { SLACK_MARKS, decodeSlackEntities, markPattern } from './blockKit';
import { CollapsibleCode } from './CollapsibleCode';
import { MSG_BOLD_CLASS, MSG_MENTION_CLASS } from './messageClasses';

const CODE_CHIP_CLASS = 'rounded-md border border-hairline bg-well px-1.5 [font-family:inherit] box-decoration-clone';

const INLINE = new RegExp(
    ['(<[^<>|]+\\|[^<>]*>)', '(<[@!][^<>|]+>)', '(<[^<>|]+>)', ...SLACK_MARKS.map(markPattern)].join('|'),
    'gu'
);

export const BlockKitLinkContext = createContext<((url: string) => void) | undefined>(undefined);

export const BLOCK_KIT_LINK_COLOR_CLASS = 'text-[color:var(--block-kit-link,hsl(var(--link)))]';

const BlockLink = ({ href, label }: { href: string; label: string }) => {
    const onLinkClick = useContext(BlockKitLinkContext);
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className={`font-semibold ${BLOCK_KIT_LINK_COLOR_CLASS} underline-offset-2 hover:underline`}
            onClick={
                onLinkClick &&
                (event => {
                    event.preventDefault();
                    onLinkClick(href);
                })
            }
        >
            {label}
        </a>
    );
};

const linkTo = (href: string, label: string, key: string): ReactNode => (
    <BlockLink key={key} href={href} label={label} />
);

const renderInline = (text: string, keyBase: string): ReactNode[] => {
    const nodes: ReactNode[] = [];
    let last = 0;
    INLINE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = INLINE.exec(text)) !== null) {
        const [token, labelled, mention, bare, boldLead, bold, italicLead, italic, strikeLead, strike] = match;
        const lead = boldLead ?? italicLead ?? strikeLead ?? '';
        const key = `${keyBase}-${match.index}`;
        const before = text.slice(last, match.index + lead.length);
        if (before) nodes.push(decodeSlackEntities(before));
        if (labelled) {
            const split = labelled.indexOf('|');
            nodes.push(linkTo(labelled.slice(1, split), decodeSlackEntities(labelled.slice(split + 1, -1)), key));
        } else if (mention) {
            nodes.push(
                <span key={key} className={MSG_MENTION_CLASS}>
                    {`@${mention.slice(2, -1)}`}
                </span>
            );
        } else if (bare) {
            nodes.push(linkTo(bare.slice(1, -1), bare.slice(1, -1), key));
        } else if (bold) {
            nodes.push(
                <strong key={key} className={MSG_BOLD_CLASS}>
                    {decodeSlackEntities(bold)}
                </strong>
            );
        } else if (italic) {
            nodes.push(<em key={key}>{decodeSlackEntities(italic)}</em>);
        } else {
            nodes.push(<s key={key}>{decodeSlackEntities(strike)}</s>);
        }
        last = match.index + token.length;
    }
    if (last < text.length) nodes.push(decodeSlackEntities(text.slice(last)));
    return nodes;
};

const renderCodeRuns = (text: string, keyBase: string): ReactNode[] =>
    text.split(/(`[^`\n]+`)/g).map((part, idx) =>
        idx % 2 === 1 ? (
            <code key={`${keyBase}-${idx}`} className={CODE_CHIP_CLASS}>
                {part.slice(1, -1)}
            </code>
        ) : (
            <Fragment key={`${keyBase}-${idx}`}>{renderInline(part, `${keyBase}-${idx}`)}</Fragment>
        )
    );

export const renderMrkdwn = (text: string): ReactNode =>
    text.split(/(```[\s\S]*?```)/g).map((part, idx) => {
        if (idx % 2 === 1) {
            const inner = part.slice(3, -3).replace(/^\n/, '').replace(/\n$/, '');
            return <CollapsibleCode key={idx} text={decodeSlackEntities(inner)} />;
        }
        return <Fragment key={idx}>{renderCodeRuns(part, String(idx))}</Fragment>;
    });
