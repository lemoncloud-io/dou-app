import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { Hint } from '../../../../shared';

/**
 * Stops a file's send while it uploads. The send is the whole message's, so this stops every file in
 * it; the message is removed rather than left failed — the reader said "don't send this".
 */
export const CancelUploadButton = ({ name, onCancel }: { name: string; onCancel: () => void }) => {
    const { t } = useTranslation();
    return (
        <Hint label={t('chat.file.cancelUploadHint')} side="bottom" delayDuration={500}>
            <button
                type="button"
                onClick={onCancel}
                aria-label={t('chat.file.cancelUpload', { name })}
                className="focus-ring tactile hit-target flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors ease-tactile hover:bg-foreground/[0.08] hover:text-foreground"
            >
                <X size={16} aria-hidden />
            </button>
        </Hint>
    );
};
