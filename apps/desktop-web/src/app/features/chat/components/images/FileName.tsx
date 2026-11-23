import { useTranslation } from 'react-i18next';

import { splitFileName } from '../../utils';
import { Hint } from '../../../../shared';

export const FileName = ({ name, onOpen }: { name: string; onOpen?: () => void }) => {
    const { t } = useTranslation();
    const { stem, extension } = splitFileName(name);
    const parts = (
        <>
            <span className="truncate">{stem}</span>
            {extension && <span className="shrink-0">{extension}</span>}
        </>
    );
    return (
        <Hint label={name} delayDuration={500}>
            {onOpen ? (
                <button
                    type="button"
                    onClick={onOpen}
                    aria-label={t('chat.voice.openDetail', { name })}
                    className="focus-ring flex min-w-0 max-w-full rounded-sm text-left text-callout font-medium text-foreground hover:underline"
                >
                    {parts}
                </button>
            ) : (
                <p className="flex min-w-0 text-callout font-medium text-foreground">{parts}</p>
            )}
        </Hint>
    );
};
