import { useTranslation } from 'react-i18next';

import { BottomSheet, SheetOption } from '@chatic/web-ui-kit';

import { NOTIFY_LEVEL_LABEL_KEY, type NotifyLevel } from '../utils/notifyLevel';

interface NotifyModeSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    value: NotifyLevel;
    levels: readonly NotifyLevel[];
    onSelect: (level: NotifyLevel) => void;
}

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
