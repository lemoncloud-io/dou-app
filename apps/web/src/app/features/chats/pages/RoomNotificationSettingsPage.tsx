import { BellOff, ChevronRight, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/page-transition';

import { Switch } from '@chatic/ui-kit/components/ui/switch';

import { PageHeader } from '../../../shared/components';

export const RoomNotificationSettingsPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();

    // TODO: Replace with actual notification permission check and API state
    const [isAppNotificationEnabled] = useState(true);
    const [isMessageNotificationEnabled, setIsMessageNotificationEnabled] = useState(true);

    const handleClose = () => {
        navigate(-1);
    };

    const handleToggleMessageNotification = (checked: boolean) => {
        setIsMessageNotificationEnabled(checked);
        // TODO: Call API to update notification settings
    };

    const handleOpenDeviceSettings = () => {
        // TODO: Implement device settings navigation
        // For web: Could show instructions or use Notification.requestPermission()
    };

    return (
        <div className="flex min-h-screen flex-col bg-background">
            <PageHeader
                title={t('chat.settings.notificationSettings.title')}
                rightAction={
                    <button onClick={handleClose} className="p-2" aria-label={t('common.close')}>
                        <X size={24} className="text-foreground" />
                    </button>
                }
            />

            <div className="flex flex-col gap-7 px-4 pt-5">
                {/* App Notification Off Banner */}
                {!isAppNotificationEnabled && (
                    <button onClick={handleOpenDeviceSettings} className="flex items-center gap-4 px-1 pb-2">
                        <BellOff size={24} className="shrink-0 text-muted-foreground" />
                        <div className="flex flex-1 flex-col gap-1">
                            <div className="flex items-center gap-1">
                                <span className="text-[17px] font-medium leading-[26px] tracking-[-0.34px] text-foreground">
                                    {t('chat.settings.notificationSettings.appNotificationOff')}
                                </span>
                                <ChevronRight size={20} className="text-muted-foreground" />
                            </div>
                            <span className="text-[14px] leading-normal tracking-[-0.07px] text-muted-foreground">
                                {t('chat.settings.notificationSettings.appNotificationOffDesc')}
                            </span>
                        </div>
                    </button>
                )}

                {/* Message Notification Card */}
                <div className="rounded-[20px] bg-card px-[18px] py-4 shadow-[0px_4px_12px_0px_rgba(0,0,0,0.08)] dark:border dark:border-border dark:shadow-none">
                    <div className="flex items-center gap-[18px]">
                        <div className="flex flex-1 flex-col gap-[3px]">
                            <span className="text-[16px] font-medium leading-[26px] tracking-[-0.32px] text-foreground">
                                {t('chat.settings.notificationSettings.messageNotification')}
                            </span>
                            <span className="text-[14px] leading-[18px] tracking-[-0.07px] text-muted-foreground">
                                {t('chat.settings.notificationSettings.messageNotificationDesc')}
                            </span>
                        </div>
                        <Switch
                            checked={isMessageNotificationEnabled}
                            onCheckedChange={handleToggleMessageNotification}
                            disabled={!isAppNotificationEnabled}
                            className="h-6 w-[42px]"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
