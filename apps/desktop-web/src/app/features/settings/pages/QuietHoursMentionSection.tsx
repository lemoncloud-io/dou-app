import { useId } from 'react';
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
    const labelId = useId();
    const hintId = useId();
    const switchId = useId();

    if (!quietHours) return null;

    const label = t('settings.quietHoursMention');

    return (
        <div className="flex items-center justify-between gap-4 pt-2">
            <div className="flex min-w-0 flex-col gap-0.5">
                <label
                    htmlFor={switchId}
                    id={labelId}
                    className="w-fit cursor-pointer text-callout font-medium text-foreground"
                >
                    {label}
                </label>
                <span id={hintId} className="text-caption text-muted-foreground">
                    {t('settings.quietHoursMentionHint')}
                </span>
            </div>
            <Switch
                id={switchId}
                className="hit-target shrink-0"
                checked={breakthrough}
                onCheckedChange={setBreakthrough}
                aria-describedby={hintId}
            />
        </div>
    );
};
