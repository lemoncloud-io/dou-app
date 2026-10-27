import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@chatic/ui-kit/components/ui/dialog';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
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
    /** The displayed member is the room owner (shows the owner badge). */
    memberIsOwner?: boolean;
    /** The displayed member is me — show "profile settings" instead of friend actions. */
    isSelf?: boolean;
    /** Viewer may remove this member from this room (group owner viewing a non-owner, non-self). */
    canKick?: boolean;
    /** Remove the member from this room (owner-only kick via leaveChannel). */
    onKick?: () => void;
    /** This room's name, for the room scope's wording. */
    roomName?: string;
    /**
     * Viewer may remove this member from the room's place (owner of the place viewing a member who
     * does not own it). The host withholds it, as it does `canKick`, when the member is me or this
     * room's owner.
     */
    canRemoveFromPlace?: boolean;
    /** Remove the member from the room's place and every group in it (`place.leave`). */
    onRemoveFromPlace?: () => void;
    /** The room's place name, for the place scope's wording. */
    placeName?: string;
    /** A removal (either scope) is in flight. */
    isKicking?: boolean;
    /** Open my per-place profile editor (only meaningful when `isSelf`). */
    onOpenProfileSettings?: () => void;
    /**
     * Open a 1:1 with this member. Present only where that is possible at all — the host decides
     * that (`canStartDmFromProfile`), the same way it decides `canKick`, so this component keeps one
     * row-composition rule instead of growing a second axis to branch on.
     */
    onStartDm?: () => void;
}

/**
 * Member profile ("프로필"). Full-screen dialog with an inline action list whose
 * items depend on WHO is viewing WHOM (ADR-0023):
 * - viewing myself → `프로필 설정` (opens the per-place profile editor).
 * - a viewer who may remove the member (room owner, place owner, or both) → `친구 설정` (deferred),
 *   `내보내기`, `신고` (deferred).
 * - anyone else viewing another member → `신고` only.
 * `친구 설정`/`신고` are UI-only for now (toast, no backend).
 *
 * `내보내기` asks for a scope first — this room, or the room's place — then confirms that scope in
 * its own words, then runs it. Only the scopes the viewer holds the right for are offered.
 */
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
    const { toast } = useToast();
    const [scopeSheetOpen, setScopeSheetOpen] = useState(false);
    /** The scope picked in the sheet, awaiting its confirm. */
    const [confirming, setConfirming] = useState<RemoveMemberScope | null>(null);

    const scopes: RemoveMemberScope[] = [
        ...(canKick ? (['room'] as const) : []),
        ...(canRemoveFromPlace ? (['place'] as const) : []),
    ];
    const canRemove = scopes.length > 0;
    const memberName = member?.name ?? '';

    // Deferred, UI-only actions acknowledge with a neutral toast (no backend yet).
    const handleReport = () => toast({ title: t('chat.settings.reportSuccess') });
    const handleFriendSettings = () => toast({ title: t('chat.settings.comingSoon') });

    const handleChooseScope = (scope: RemoveMemberScope) => {
        setScopeSheetOpen(false);
        setConfirming(scope);
    };

    const handleConfirmRemove = () => {
        if (confirming === 'room') onKick?.();
        if (confirming === 'place') onRemoveFromPlace?.();
        setConfirming(null);
    };

    // Row set by viewer role / target: self → profile settings; a viewer who may remove → manage +
    // remove + report; otherwise report only.
    const roleRows: Array<{ key: string; label: string; onClick: () => void }> = isSelf
        ? [{ key: 'profile', label: t('chat.settings.profileSettings'), onClick: () => onOpenProfileSettings?.() }]
        : canRemove
          ? [
                { key: 'friendSettings', label: t('chat.settings.friendSettings'), onClick: handleFriendSettings },
                { key: 'kick', label: t('chat.settings.removeMember'), onClick: () => setScopeSheetOpen(true) },
                { key: 'report', label: t('chat.settings.report'), onClick: handleReport },
            ]
          : [{ key: 'report', label: t('chat.settings.report'), onClick: handleReport }];

    // "Talk to them" goes first: it is the only row that starts something rather than managing or
    // reporting. Never on my own profile — `isSelf` is checked here too, so a host that forgets cannot
    // offer a room with myself. Provisional placement: no comp exists for this row.
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
                    // The slide-up variant's own `pt-safe-top` renders the status-bar band as opaque
                    // `bg-background` ABOVE the glass bar, so only the 44px bar looked frosted. The
                    // bar carries the inset itself (ModalTopBar's default `safeArea`), which puts the
                    // whole band inside the translucent, blurred header. Inline rather than a `pt-0`
                    // class: `pt-safe-top` is a custom spacing key tailwind-merge does not classify
                    // as padding-top, so both would survive and utility order would decide.
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
