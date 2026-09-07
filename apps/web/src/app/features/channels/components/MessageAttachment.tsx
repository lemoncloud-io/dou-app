import { useTranslation } from 'react-i18next';

import type { ChatAttachment } from '@lemoncloud/chatic-socials-api';
import { IconChevronRight } from '@chatic/web-ui-kit';

import { hasAttachmentContent, resolveAttachmentAccent, safeAttachmentUrl } from '../utils/chatAttachment';
import { openExternalUrl } from '../utils/openExternalUrl';

interface MessageAttachmentProps {
    /** `ChatModel.attach$` — the structured payload the sender supplied. */
    attach?: ChatAttachment | null;
}

/** Epoch SECONDS per the contract, unlike every other timestamp in the app. */
const formatAttachmentTime = (ts?: number): string | undefined => {
    if (!ts) return undefined;
    const date = new Date(ts * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date.toLocaleString();
};

/**
 * The structured attachment that rides along with a message's plain `content` — the Slack-lineage
 * card a webhook sender (today: error-report alarms) fills in.
 *
 * The server stores `attach$` verbatim and never interprets it, so everything defensive lives here:
 * empty attachments render nothing, an unknown severity falls back to a neutral rail rather than a
 * made-up colour, and the source link is dropped unless it is `http(s)` — it is handed to the OS
 * browser, so an executable scheme would be handing over a loaded gun.
 */
export const MessageAttachment = ({ attach }: MessageAttachmentProps) => {
    const { t } = useTranslation();

    if (!hasAttachmentContent(attach) || !attach) return null;

    const accent = resolveAttachmentAccent(attach.color);
    const sourceUrl = safeAttachmentUrl(attach.sourceUrl);
    const time = formatAttachmentTime(attach.ts);
    const meta = [attach.footer, time].filter(Boolean).join(' · ');

    return (
        <div
            className="w-full overflow-hidden rounded-[12px] border border-border bg-surface"
            // The rail is the severity, so it is the one colour that cannot come from a class.
            style={{ borderLeftWidth: 4, borderLeftColor: accent }}
        >
            <div className="flex flex-col gap-1.5 px-3 py-2.5">
                {(attach.pretext || attach.username) && (
                    <p className="text-[12px] font-medium leading-[1.4] text-description">
                        {[attach.username, attach.pretext].filter(Boolean).join(' · ')}
                    </p>
                )}

                {attach.title && (
                    <p className="text-[14px] font-semibold leading-[1.4] tracking-[-0.07px] text-foreground">
                        {attach.title}
                    </p>
                )}

                {attach.text && (
                    <p className="whitespace-pre-line break-words text-[14px] leading-[1.45] tracking-[-0.07px] text-label">
                        {attach.text}
                    </p>
                )}

                {!!attach.fields?.length && (
                    <dl className="mt-0.5 flex flex-col gap-1">
                        {attach.fields.map((field, index) => (
                            <div
                                key={`${field.title ?? ''}-${index}`}
                                className="flex gap-2 text-[12px] leading-[1.45]"
                            >
                                {field.title && <dt className="shrink-0 text-description">{field.title}</dt>}
                                <dd className="min-w-0 break-words text-label">{String(field.value)}</dd>
                            </div>
                        ))}
                    </dl>
                )}

                {meta && <p className="text-[11px] leading-[1.4] text-description">{meta}</p>}

                {sourceUrl && (
                    // Same shape as a link in the message body (MessageText): the `href` stays so a
                    // screen reader announces a link and the OS context menu offers "copy link",
                    // while navigation goes through `openExternalUrl` — inside the native shell the
                    // URL has to reach the OS browser, not the webview.
                    <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        onClick={event => {
                            event.preventDefault();
                            openExternalUrl(sourceUrl);
                        }}
                        className="mt-0.5 flex w-fit items-center gap-0.5 text-[12px] font-medium text-point-blue underline underline-offset-2"
                    >
                        {t('chat.room.attachment.openSource')}
                        <IconChevronRight className="size-3.5" />
                    </a>
                )}
            </div>
        </div>
    );
};
