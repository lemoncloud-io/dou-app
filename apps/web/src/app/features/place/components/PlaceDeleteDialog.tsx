import { useTranslation } from 'react-i18next';

import { IconUsersGroup } from '@chatic/web-ui-kit';

import { PlaceConfirmDialog } from './PlaceConfirmDialog';

export interface PlaceDeleteRoom {
    id: string;
    name: string;
    memberCount: number;
}

interface PlaceDeleteDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The place's chat rooms as this device holds them — what the owner is about to take away. */
    rooms: PlaceDeleteRoom[];
    onConfirm: () => void;
    isPending?: boolean;
}

/**
 * The owner's "delete this place?" confirm: the place confirm, plus a card listing the place's chat
 * rooms with their member counts, so the owner sees what members lose before saying yes.
 *
 * The confirm keeps the dialog up while the request runs; the caller closes it once the delete
 * settles.
 */
export const PlaceDeleteDialog = ({
    open,
    onOpenChange,
    rooms,
    onConfirm,
    isPending = false,
}: PlaceDeleteDialogProps) => {
    const { t } = useTranslation();

    return (
        <PlaceConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t('placeDelete.dialog.title')}
            description={t('placeDelete.dialog.description')}
            confirmLabel={t('placeDelete.dialog.confirm')}
            onConfirm={onConfirm}
            isPending={isPending}
            closeOnConfirm={false}
        >
            <div className="flex w-full flex-col items-center gap-3 rounded-2xl border border-input-border bg-background p-2.5">
                <p className="w-full text-center text-[16px] font-semibold leading-[1.5] text-foreground">
                    {t('placeDelete.rooms.title')}
                </p>
                <div className="flex w-full flex-col gap-2">
                    <p className="flex items-center gap-2 text-[15px] leading-[1.45] tracking-[-0.075px]">
                        <span className="font-medium text-label">{t('placeDelete.rooms.label')}</span>
                        <span className="font-semibold text-foreground">
                            {t('placeDelete.rooms.count', { count: rooms.length })}
                        </span>
                    </p>
                    {rooms.length > 0 && (
                        <ul className="flex max-h-[180px] w-full flex-col gap-2 overflow-y-auto rounded-2xl bg-control-surface px-3.5 py-3">
                            {rooms.map(room => (
                                <li key={room.id} className="flex items-center gap-3">
                                    <span className="line-clamp-2 min-w-0 flex-1 text-[14px] font-medium leading-[1.45] tracking-[-0.07px] text-foreground">
                                        {room.name}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold leading-4 tracking-[-0.065px] text-foreground">
                                        <IconUsersGroup size={18} aria-hidden />
                                        <span className="flex gap-0.5">
                                            <span>{t('placeDelete.rooms.members')}</span>
                                            <span>{room.memberCount}</span>
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </PlaceConfirmDialog>
    );
};
