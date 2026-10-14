import { useTranslation } from 'react-i18next';

import { Switch } from '@chatic/ui-kit/components/ui/switch';

import { useNotificationPrefsStore } from '../../../shared';

/**
 * Quiet-hours breakthrough for mentions that name me. Rendered inside the
 * quiet-hours card, and only while quiet hours are set — a switch with no
 * window to break through would read as a second notification master switch.
 */
export const QuietHoursMentionSection = () => {
    const { t } = useTranslation();
    const quietHours = useNotificationPrefsStore(s => s.quietHours);
    const breakthrough = useNotificationPrefsStore(s => s.mentionBreaksQuietHours);
    const setBreakthrough = useNotificationPrefsStore(s => s.setMentionBreaksQuietHours);

    if (!quietHours) return null;

    const label = t('settings.quietHoursMention');

    return (
        <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-callout font-medium text-foreground">{label}</span>
                <span className="text-caption text-muted-foreground">{t('settings.quietHoursMentionHint')}</span>
            </div>
            <Switch
                className="hit-target"
                checked={breakthrough}
                onCheckedChange={setBreakthrough}
                aria-label={label}
            />
        </div>
    );
};
