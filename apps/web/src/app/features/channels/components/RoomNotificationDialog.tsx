import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { BellOff, ChevronRight, X } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@chatic/ui-kit/components/ui/dialog';
import { Switch } from '@chatic/web-ui-kit';

interface RoomNotificationDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Room notification settings. UI only — the message-notification toggle is local
 * state and is not persisted (no backend mutation yet, per ADR-0014). The
 * "app notifications off" banner is informational.
 */
export const RoomNotificationDialog = ({ open, onOpenChange }: RoomNotificationDialogProps) => {
    const { t } = useTranslation();
    const [messageEnabled, setMessageEnabled] = useState(false);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className="m-0 flex w-full max-w-full flex-col rounded-none bg-background"
                hideClose
                variant="slide-up"
            >
                <DialogDescription className="sr-only">Room notification settings</DialogDescription>
                {/* Top Bar */}
                <div className="flex items-center justify-between bg-background px-1.5 py-3">
                    <div className="h-11 w-11" />
                    <DialogTitle className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-foreground">
                        {t('chat.settings.notificationSettings.title')}
                    </DialogTitle>
                    <button onClick={() => onOpenChange(false)} className="flex h-11 w-11 items-center justify-center">
                        <X className="h-6 w-6 text-foreground" />
                    </button>
                </div>

                {/* App notifications off banner */}
                <button type="button" className="flex items-center gap-3 px-4 py-3.5 text-left">
                    <BellOff className="h-6 w-6 shrink-0 text-muted-foreground" />
                    <div className="flex flex-1 flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                            <span className="text-[16px] font-semibold leading-[1.4] text-foreground">
                                {t('chat.settings.notificationSettings.appNotificationOff')}
                            </span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <span className="text-[13px] font-normal leading-[1.4] text-muted-foreground">
                            {t('chat.settings.notificationSettings.appNotificationOffDesc')}
                        </span>
                    </div>
                </button>

                {/* Message notification toggle */}
                <div className="px-4 pt-2">
                    <div className="flex items-center gap-3 rounded-[12px] bg-muted px-4 py-3.5">
                        <div className="flex flex-1 flex-col gap-0.5">
                            <span className="text-[16px] font-semibold leading-[1.4] text-foreground">
                                {t('chat.settings.notificationSettings.messageNotification')}
                            </span>
                            <span className="text-[13px] font-normal leading-[1.4] text-muted-foreground">
                                {t('chat.settings.notificationSettings.messageNotificationDesc')}
                            </span>
                        </div>
                        <Switch
                            checked={messageEnabled}
                            onCheckedChange={setMessageEnabled}
                            label={t('chat.settings.notificationSettings.messageNotification')}
                        />
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
