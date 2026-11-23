import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Plus } from 'lucide-react';

import { CHAT_ATTACHMENT_ACCEPT } from '@chatic/runtime';
import { Hint } from '../../../../shared';
import { COMPOSER_ACTION_BUTTON } from '../editor/composerActionButton';

interface AttachButtonProps {
    onFiles: (files: File[]) => void;
}

export const AttachButton = ({ onFiles }: AttachButtonProps) => {
    const { t } = useTranslation();
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <>
            <Hint label={t('chat.attach.add')}>
                <button
                    type="button"
                    aria-label={t('chat.attach.add')}
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
                    event.target.value = '';
                    if (files.length > 0) onFiles(files);
                }}
            />
        </>
    );
};
