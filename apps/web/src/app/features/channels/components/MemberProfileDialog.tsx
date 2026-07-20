import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { IconCheck, ListRow, ModalTopBar, ProfileAvatar } from '@chatic/web-ui-kit';

import { ConfirmDialog } from './ConfirmDialog';

interface ProfileMember {
    id: string;
    name: string;
    avatar?: string | null;
}

interface MemberProfileDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    member: ProfileMember | null;
    /** The displayed member is the room owner (shows the owner badge). */
    memberIsOwner?: boolean;
    /** The displayed member is me — show "profile settings" instead of friend actions. */
    isSelf?: boolean;
    /** Viewer may remove this member (room owner viewing a non-owner, non-self). */
    canKick?: boolean;
    /** Remove the member from the room (owner-only kick via leaveChannel). */
    onKick?: () => void;
    isKicking?: boolean;
    /** Open my per-place profile editor (only meaningful when `isSelf`). */
    onOpenProfileSettings?: () => void;
}

/**
 * Member profile ("프로필"). Full-screen dialog with an inline action list whose
 * items depend on WHO is viewing WHOM (ADR-0022):
 * - viewing myself → `프로필 설정` (opens the per-place profile editor).
 * - owner viewing another member → `친구 설정` (deferred), `내보내기` (real kick), `신고` (deferred).
 * - member viewing another member → `신고` only.
 * `친구 설정`/`신고` are UI-only for now (toast, no backend).
 */
export const MemberProfileDialog = ({
    open,
    onOpenChange,
    member,
    memberIsOwner = false,
    isSelf = false,
    canKick = false,
    onKick,
    isKicking = false,
    onOpenProfileSettings,
}: MemberProfileDialogProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [confirmKick, setConfirmKick] = useState(false);

    // Deferred, UI-only actions acknowledge with a neutral toast (no backend yet).
    const handleReport = () => toast({ title: t('chat.settings.reportSuccess') });
    const handleFriendSettings = () => toast({ title: t('chat.settings.comingSoon') });

    const handleConfirmKick = () => {
        onKick?.();
        setConfirmKick(false);
    };

    // Row set by viewer role / target: self → profile settings; owner-over-member → manage + kick +
    // report; otherwise report only.
    const rows: Array<{ key: string; label: string; onClick: () => void }> = isSelf
        ? [{ key: 'profile', label: t('chat.settings.profileSettings'), onClick: () => onOpenProfileSettings?.() }]
        : canKick
          ? [
                { key: 'friendSettings', label: t('chat.settings.friendSettings'), onClick: handleFriendSettings },
                { key: 'kick', label: t('chat.settings.removeMember'), onClick: () => setConfirmKick(true) },
                { key: 'report', label: t('chat.settings.report'), onClick: handleReport },
            ]
          : [{ key: 'report', label: t('chat.settings.report'), onClick: handleReport }];

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className="m-0 flex h-full max-h-[100dvh] w-full max-w-full flex-col items-center rounded-none bg-background p-0"
                    hideClose
                    variant="slide-up"
                >
                    <DialogTitle className="sr-only">{t('chat.settings.profileHeader')}</DialogTitle>
                    <DialogDescription className="sr-only">Member profile</DialogDescription>

                    <div className="flex h-full w-full max-w-[440px] flex-col">
                        <ModalTopBar
                            title={t('chat.settings.profileHeader')}
                            onClose={() => onOpenChange(false)}
                            closeLabel={t('chat.settings.close')}
                        />

                        {/* Avatar + name */}
                        <div className="flex flex-col items-center gap-3 pt-6">
                            <div className="relative">
                                <ProfileAvatar src={member?.avatar ?? undefined} alt={member?.name ?? ''} size={86} />
                                {memberIsOwner && (
                                    <span className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-main-accent shadow-[0px_1px_3px_0px_rgba(0,0,0,0.16)]">
                                        <IconCheck className="size-4 text-white" strokeWidth={3} />
                                    </span>
                                )}
                            </div>
                            <span className="text-[18px] font-semibold leading-[1.4] tracking-[-0.18px] text-foreground">
                                {member?.name}
                            </span>
                        </div>

                        {/* Action list */}
                        <div className="mt-6 flex flex-col">
                            {rows.map(row => (
                                <ListRow key={row.key} title={row.label} onClick={row.onClick} />
                            ))}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={confirmKick}
                onOpenChange={setConfirmKick}
                title={t('chat.settings.kickDialog.title')}
                description={t('chat.settings.kickDialog.description')}
                confirmLabel={t('chat.settings.kickDialog.confirm')}
                onConfirm={handleConfirmKick}
                isPending={isKicking}
                variant="danger"
            />
        </>
    );
};
