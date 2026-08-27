import { useTranslation } from 'react-i18next';

import { ListRow, MenuCard, Switch } from '@chatic/web-ui-kit';

import { useDevicePushMute } from '../hooks';
import { usePreferenceStore } from '../../../stores/usePreferenceStore';
import { PageHeader } from '../../../ui/components';

/**
 * Notification preferences, one level under the settings depth. The Figma settings list only
 * carries the "알림 설정" entry row; this screen is the destination it implies, so it holds the two
 * notification toggles the MY hub used to show inline. Revisit the row layout when the depth's own
 * design lands.
 */
export const NotificationSettingsPage = () => {
    const { t } = useTranslation();
    const { pushEnabled, setPushEnabled, isSupported: pushSupported } = useDevicePushMute();
    const { blurLastMessage, setBlurLastMessage } = usePreferenceStore();

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background pt-safe-top">
            <PageHeader title={t('mypage.notificationSettings')} />

            <div className="flex flex-col gap-[18px] px-4 pb-8 pt-4">
                <MenuCard>
                    {/* Device-global push mute. ON = notifications received (muted:false). Outside a
                        native shell no push device exists (the write would 404), so the toggle is
                        disabled with a hint instead of erroring — see useDevicePushMute. */}
                    <ListRow
                        title={t('mypage.pushNotifications')}
                        subtitle={pushSupported ? undefined : t('mypage.push.appOnly')}
                        trailing={
                            <Switch checked={pushEnabled} onCheckedChange={setPushEnabled} disabled={!pushSupported} />
                        }
                    />
                    <ListRow
                        title={t('mypage.messagePreview')}
                        trailing={<Switch checked={!blurLastMessage} onCheckedChange={v => setBlurLastMessage(!v)} />}
                    />
                </MenuCard>
            </div>
        </div>
    );
};
