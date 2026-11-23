import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { CodeBlock } from '@chatic/web-ui-kit';

import { copyMessageToClipboard } from '../utils/copyMessageToClipboard';

const COPIED_FEEDBACK_MS = 1500;

export interface MessageCodeBlockProps {
    code: string;
    lang?: string;
}

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
            copyLabel={t('chat.room.copyCode')}
            copiedLabel={t('chat.room.codeCopied')}
            buttonProps={{ onPointerDown: stopGesture, onContextMenu: stopGesture }}
        />
    );
};
