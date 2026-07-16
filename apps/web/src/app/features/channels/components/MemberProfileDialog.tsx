import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, ChevronLeft, MoreHorizontal } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@chatic/ui-kit/components/ui/dialog';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@chatic/ui-kit/components/ui/dropdown-menu';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import { ProfileAvatar } from '@chatic/web-ui-kit';

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
    /** Viewer may remove this member (room owner viewing a non-owner, non-self). */
    canKick?: boolean;
    /** Remove the member from the room (owner-only kick via leaveChannel). */
    onKick?: () => void;
    isKicking?: boolean;
}

/**
 * Member profile ("친구 정보"). Name is read-only (nickname editing is out of
 * scope, ADR-0014). The ⋯ menu offers "report" (UI only — toast) for everyone
 * and "remove friend" (real kick) only when the viewer is the room owner.
 */
export const MemberProfileDialog = ({
    open,
    onOpenChange,
    member,
    memberIsOwner = false,
    canKick = false,
    onKick,
    isKicking = false,
}: MemberProfileDialogProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [confirmKick, setConfirmKick] = useState(false);

    const handleReport = () => {
        // Report is not wired to a backend yet (ADR-0014) — acknowledge with a toast.
        toast({ title: t('chat.settings.reportSuccess') });
    };

    const handleConfirmKick = () => {
        onKick?.();
        setConfirmKick(false);
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className="m-0 flex w-full max-w-full flex-col rounded-none bg-background"
                    hideClose
                    variant="slide-up"
                >
                    <DialogDescription className="sr-only">Member profile</DialogDescription>
                    {/* Top Bar */}
                    <div className="flex items-center justify-between bg-background px-1.5 py-3">
                        <button
                            onClick={() => onOpenChange(false)}
                            className="flex h-11 w-11 items-center justify-center"
                            aria-label="back"
                        >
                            <ChevronLeft className="h-6 w-6 text-foreground" />
                        </button>
                        <DialogTitle className="text-[16px] font-semibold leading-[1.625] tracking-[0.005em] text-foreground">
                            {t('chat.settings.friendInfo.title')}
                        </DialogTitle>
                        <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                                <button className="flex h-11 w-11 items-center justify-center" aria-label="menu">
                                    <MoreHorizontal className="h-6 w-6 text-foreground" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={handleReport}>{t('chat.settings.report')}</DropdownMenuItem>
                                {canKick && (
                                    <DropdownMenuItem
                                        onSelect={() => setConfirmKick(true)}
                                        className="text-destructive focus:text-destructive"
                                    >
                                        {t('chat.settings.deleteFriend')}
                                    </DropdownMenuItem>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>

                    {/* Avatar + name */}
                    <div className="flex flex-col items-center gap-3 pt-8">
                        <div className="relative">
                            <ProfileAvatar src={member?.avatar ?? undefined} alt={member?.name ?? ''} size={86} />
                            {memberIsOwner && (
                                <div className="absolute -bottom-1 -right-1 flex size-6 items-center justify-center rounded-full bg-[#B0EA10] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.16)]">
                                    <Check className="size-4 text-white" strokeWidth={3} />
                                </div>
                            )}
                        </div>
                        <span className="text-[18px] font-semibold leading-[1.4] tracking-[-0.18px] text-foreground">
                            {member?.name}
                        </span>
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
