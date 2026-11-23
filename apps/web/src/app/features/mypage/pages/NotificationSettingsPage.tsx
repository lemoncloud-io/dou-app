import { useTranslation } from 'react-i18next';

import { ListRow, MenuCard, Switch } from '@chatic/web-ui-kit';

import { useDevicePushMute } from '../hooks';
import { useBlurLastMessage } from '../../../hooks';
import { PageHeader } from '../../../ui/components';
import { SafeAreaBottomSpacer } from '../../../ui/components/SafeAreaBottomSpacer';
import { haptics } from '../../../bridge/haptics';

export const NotificationSettingsPage = () => {
    const { t } = useTranslation();
    const { pushEnabled, setPushEnabled, isSupported: pushSupported } = useDevicePushMute();
    const { blurLastMessage, setBlurLastMessage } = useBlurLastMessage();

    return (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-background">
            <div className="sticky top-0 z-20 shrink-0">
                <PageHeader title={t('mypage.notificationSettings')} />
            </div>

            <div className="flex flex-col gap-[18px] px-4 pb-8 pt-4">
                <MenuCard>
                    <ListRow
                        title={t('mypage.pushNotifications')}
                        subtitle={pushSupported ? undefined : t('mypage.push.appOnly')}
                        trailing={
                            <Switch
                                checked={pushEnabled}
                                onCheckedChange={on => {
                                    haptics.play('selection');
                                    setPushEnabled(on);
                                }}
                                disabled={!pushSupported}
                            />
                        }
                    />
                    <ListRow
                        title={t('mypage.messagePreview')}
                        trailing={
                            <Switch
                                checked={!blurLastMessage}
                                onCheckedChange={v => {
                                    haptics.play('selection');
                                    setBlurLastMessage(!v);
                                }}
                            />
                        }
                    />
                </MenuCard>
            </div>
            <SafeAreaBottomSpacer />
        </div>
    );
};
