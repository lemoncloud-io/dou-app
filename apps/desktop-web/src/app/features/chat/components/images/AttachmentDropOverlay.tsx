import { useTranslation } from 'react-i18next';

import { Paperclip } from 'lucide-react';

import { CHAT_ATTACHMENT_MAX_BYTES } from '@chatic/runtime';

import { MAX_ATTACHMENTS, VOICE_EXTENSIONS, formatFileSize } from '../../utils';

export const AttachmentDropOverlay = () => {
    const { t } = useTranslation();
    return (
        <div
            aria-hidden
            className="pointer-events-none absolute inset-x-6 bottom-5 top-4 z-overlay flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-description/60 bg-background/95 animate-fade-in"
        >
            <span className="mb-2 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-raised">
                <Paperclip size={28} aria-hidden />
            </span>
            <p className="text-headline font-semibold text-foreground">{t('chat.attach.dropTitle')}</p>
            <p className="text-callout text-label">{t('chat.attach.dropHint', { count: MAX_ATTACHMENTS })}</p>
            <p className="text-caption text-description">
                {t('chat.attach.dropVoiceHint', {
                    extensions: VOICE_EXTENSIONS.join(', '),
                    size: formatFileSize(CHAT_ATTACHMENT_MAX_BYTES.file),
                })}
            </p>
        </div>
    );
};
