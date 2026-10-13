import { useTranslation } from 'react-i18next';

import { BottomSheet, SheetOption } from '@chatic/web-ui-kit';

import { NOTIFY_LEVEL_LABEL_KEY, type NotifyLevel } from '../utils/notifyLevel';

interface NotifyModeSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The level currently in effect — the one drawn as selected. */
    value: NotifyLevel;
    /** The levels this room offers, in display order (a 1:1 offers fewer than a group). */
    levels: readonly NotifyLevel[];
    onSelect: (level: NotifyLevel) => void;
}

/**
 * Room notification level picker. Writing the level is the caller's job; the sheet only reports the
 * pick. There is no explicit save, so picking an option closes the sheet at once.
 */
export const NotifyModeSheet = ({ open, onOpenChange, value, levels, onSelect }: NotifyModeSheetProps) => {
    const { t } = useTranslation();
    const title = t('chat.settings.roomNotification');

    const handleSelect = (level: NotifyLevel) => () => {
        onSelect(level);
        onOpenChange(false);
    };

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={title}
            onClose={() => onOpenChange(false)}
            closeLabel={t('chat.settings.close')}
        >
            <div className="px-4 pb-2" role="radiogroup" aria-label={title}>
                {levels.map((level, index) => (
                    <SheetOption
                        key={level}
                        label={t(NOTIFY_LEVEL_LABEL_KEY[level])}
                        selected={value === level}
                        onSelect={handleSelect(level)}
                        showDivider={index < levels.length - 1}
                    />
                ))}
            </div>
        </BottomSheet>
    );
};
