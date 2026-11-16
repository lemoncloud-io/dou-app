import { useTranslation } from 'react-i18next';

import { splitFileName } from '../../utils';
import { Hint } from '../../../../shared';

/**
 * A file name on one line that, when it does not fit, gives way in the stem and keeps its extension —
 * "팀 회의 1107_최종본_전체녹….m4a" still says it is a voice file. The whole name is in the hint.
 */
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
