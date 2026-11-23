import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { IconCheck, ListRow, ModalTopBar, ProfileAvatar } from '@chatic/web-ui-kit';

import { ConfirmDialog } from './ConfirmDialog';
import { RemoveMemberScopeSheet, type RemoveMemberScope } from './RemoveMemberScopeSheet';

interface ProfileMember {
    id: string;
    name: string;
    avatar?: string | null;
}

interface MemberProfileDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    member: ProfileMember | null;
    memberIsOwner?: boolean;
    isSelf?: boolean;
    canKick?: boolean;
    onKick?: () => void;
    roomName?: string;
    canRemoveFromPlace?: boolean;
    onRemoveFromPlace?: () => void;
    placeName?: string;
    isKicking?: boolean;
    onOpenProfileSettings?: () => void;
    onStartDm?: () => void;
}

export const MemberProfileDialog = ({
    open,
    onOpenChange,
    member,
    memberIsOwner = false,
    isSelf = false,
    canKick = false,
    onKick,
    roomName,
    canRemoveFromPlace = false,
    onRemoveFromPlace,
    placeName,
    isKicking = false,
    onOpenProfileSettings,
    onStartDm,
}: MemberProfileDialogProps) => {
    const { t } = useTranslation();
    const [scopeSheetOpen, setScopeSheetOpen] = useState(false);
    const [confirming, setConfirming] = useState<RemoveMemberScope | null>(null);

    const scopes: RemoveMemberScope[] = [
        ...(canKick ? (['room'] as const) : []),
        ...(canRemoveFromPlace ? (['place'] as const) : []),
    ];
    const canRemove = scopes.length > 0;
    const memberName = member?.name ?? '';

    const handleChooseScope = (scope: RemoveMemberScope) => {
        setScopeSheetOpen(false);
        setConfirming(scope);
    };

    const handleConfirmRemove = () => {
        if (confirming === 'room') onKick?.();
        if (confirming === 'place') onRemoveFromPlace?.();
        setConfirming(null);
    };

    const roleRows: Array<{ key: string; label: string; onClick: () => void }> = isSelf
        ? [{ key: 'profile', label: t('chat.settings.profileSettings'), onClick: () => onOpenProfileSettings?.() }]
        : canRemove
          ? [{ key: 'kick', label: t('chat.settings.removeMember'), onClick: () => setScopeSheetOpen(true) }]
          : [];

    const rows =
        onStartDm && !isSelf
            ? [{ key: 'startDm', label: t('cloudDm.startFromProfile'), onClick: onStartDm }, ...roleRows]
            : roleRows;

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className="flex h-full max-h-[100dvh] w-full flex-col rounded-none bg-background p-0"
                    hideClose
                    variant="slide-up"
                    style={{ paddingTop: 0 }}
                >
                    <DialogTitle className="sr-only">{t('chat.settings.profileHeader')}</DialogTitle>
                    <DialogDescription className="sr-only">Member profile</DialogDescription>

                    <div className="flex h-full w-full flex-col">
                        <ModalTopBar
                            title={t('chat.settings.profileHeader')}
                            onClose={() => onOpenChange(false)}
                            closeLabel={t('chat.settings.close')}
                        />

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

                        {rows.length > 0 && (
                            <div data-testid="member-profile-actions" className="mt-6 flex flex-col">
                                {rows.map(row => (
                                    <ListRow key={row.key} title={row.label} onClick={row.onClick} />
                                ))}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <RemoveMemberScopeSheet
                open={scopeSheetOpen}
                onOpenChange={setScopeSheetOpen}
                memberName={memberName}
                roomName={roomName}
                placeName={placeName}
                scopes={scopes}
                onChoose={handleChooseScope}
            />

            <ConfirmDialog
                open={confirming !== null}
                onOpenChange={open => !open && setConfirming(null)}
                title={t(
                    confirming === 'place'
                        ? 'chat.settings.removeScope.place.confirmTitle'
                        : 'chat.settings.removeScope.room.confirmTitle'
                )}
                description={
                    confirming === 'place'
                        ? t('chat.settings.removeScope.place.confirmDescription', {
                              name: memberName,
                              place: placeName ?? '',
                          })
                        : t('chat.settings.removeScope.room.confirmDescription', { name: memberName })
                }
                confirmLabel={t('chat.settings.removeScope.confirm')}
                onConfirm={handleConfirmRemove}
                isPending={isKicking}
                variant="danger"
            />
        </>
    );
};
