import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { CodeBlock } from '@chatic/web-ui-kit';

import { copyMessageToClipboard } from '../utils/copyMessageToClipboard';

/** How long the button reads "copied" before returning to its normal label. */
const COPIED_FEEDBACK_MS = 1500;

export interface MessageCodeBlockProps {
    code: string;
    lang?: string;
}

/**
 * A fenced code block in a chat bubble, with a button that copies JUST THE CODE.
 *
 * The message action sheet already offers "copy", but that copies the whole message — fine for a
 * sentence, useless when what you wanted was the snippet. The two coexist.
 *
 * **The pointer boundary is the delicate part.** The entire bubble is a long-press target, so a
 * press starting on this button would also start the timer and open the action sheet on top of the
 * copy. Links solve their version of this after the fact, by swallowing the click that follows a
 * fired long-press; a button can do better and stop the gesture from ever starting.
 *
 * Only the two events that START a gesture are stopped. ChannelMessageRow wires pointerdown to the
 * timer and pointerup/leave/cancel to CLEARING it, so stopping those three would do the opposite of
 * the intent: a press begun on the code text and released on this button would have its cancel
 * swallowed and fire the action sheet anyway. (Touch hides this — implicit pointer capture
 * retargets pointerup to the element that saw pointerdown — but a mouse reproduces it.)
 *
 * `stopPropagation` only — not `preventDefault`. The click still has to reach this button's own
 * handler, and on touch the browser still needs to synthesise it.
 */
export const MessageCodeBlock = ({ code, lang }: MessageCodeBlockProps) => {
    const { t } = useTranslation();
    const [copied, setCopied] = useState(false);
    const timerRef = useRef<number | null>(null);

    useEffect(
        () => () => {
            if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        },
        []
    );

    const handleCopy = () => {
        void (async () => {
            try {
                // Returns false rather than throwing on the native path, so the result has to be
                // checked — otherwise the button claims success on a copy that did not happen.
                if (!(await copyMessageToClipboard(code))) return;
                setCopied(true);
                if (timerRef.current !== null) window.clearTimeout(timerRef.current);
                timerRef.current = window.setTimeout(() => {
                    timerRef.current = null;
                    setCopied(false);
                }, COPIED_FEEDBACK_MS);
            } catch (error) {
                logger.error('CLIPBOARD', '[MessageCodeBlock] Failed to copy code', { error });
            }
        })();
    };

    const stopGesture = (event: { stopPropagation: () => void }) => event.stopPropagation();

    return (
        <CodeBlock
            code={code}
            lang={lang}
            copied={copied}
            onCopy={handleCopy}
            copyLabel={t('chat.room.copyCode', { defaultValue: '복사' })}
            copiedLabel={t('chat.room.codeCopied', { defaultValue: '복사됨' })}
            buttonProps={{ onPointerDown: stopGesture, onContextMenu: stopGesture }}
        />
    );
};
