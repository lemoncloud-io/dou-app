import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Plus } from 'lucide-react';

import { CHAT_ATTACHMENT_ACCEPT } from '@chatic/data';
import { Hint } from '../../../../shared';
import { COMPOSER_ACTION_BUTTON } from '../editor/composerActionButton';

interface AttachButtonProps {
    onFiles: (files: File[]) => void;
}

/**
 * The composer's "+": opens the OS picker for images, videos and documents. Unsupported picks still go
 * through the tray's validation, so they are reported the same way a drop is.
 *
 * It opened a menu first, with one entry ("Upload from your computer") that did the
 * same thing one click later.
 */
export const AttachButton = ({ onFiles }: AttachButtonProps) => {
    const { t } = useTranslation();
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <>
            <Hint label={t('chat.attach.add')}>
                <button
                    type="button"
                    aria-label={t('chat.attach.add')}
                    // mousedown default kept off so the editor keeps its caret.
                    onMouseDown={event => event.preventDefault()}
                    onClick={() => inputRef.current?.click()}
                    className={COMPOSER_ACTION_BUTTON}
                >
                    <Plus size={18} aria-hidden />
                </button>
            </Hint>
            <input
                ref={inputRef}
                type="file"
                multiple
                accept={CHAT_ATTACHMENT_ACCEPT}
                tabIndex={-1}
                aria-hidden
                className="hidden"
                onChange={event => {
                    const files = Array.from(event.target.files ?? []);
                    // Reset so picking the same file again still fires change (and meets the duplicate check).
                    event.target.value = '';
                    if (files.length > 0) onFiles(files);
                }}
            />
        </>
    );
};
