import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
import { BottomSheet, Button, ListRow } from '@chatic/web-ui-kit';

/** Where a member is removed from: this room only, or the room's place and every group in it. */
export type RemoveMemberScope = 'room' | 'place';

interface RemoveMemberScopeSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** The member being removed, as the profile names them. */
    memberName: string;
    /** This room's name — present when I may remove from the room. */
    roomName?: string;
    /** The room's place name — present when I may remove from the place. */
    placeName?: string;
    /** The scopes I hold the right for, in display order. A scope I cannot use is not drawn. */
    scopes: readonly RemoveMemberScope[];
    /** The pick, once the bottom button confirms it. Confirming the removal itself is the caller's. */
    onChoose: (scope: RemoveMemberScope) => void;
}

/**
 * "Where should this member leave from?" — the first step of removing a member from their profile.
 *
 * Built from the sheet parts the app already uses (the titled `BottomSheet`, `ListRow`, the green
 * footer `Button` of the phone-verification sheet) with the radio mark `SheetOption` draws, because
 * `SheetOption` carries no description line and each scope here needs one. No comp exists for this
 * sheet from the profile; the layout follows the report-management flow's scope screen.
 *
 * Even one available scope is shown as a choice rather than skipped: the step is where the reader
 * learns how far the removal reaches, which matters most when the only option is the wide one.
 * Nothing is picked when the sheet opens, and the button waits for a pick.
 */
export const RemoveMemberScopeSheet = ({
    open,
    onOpenChange,
    memberName,
    roomName,
    placeName,
    scopes,
    onChoose,
}: RemoveMemberScopeSheetProps) => {
    const { t } = useTranslation();
    const [picked, setPicked] = useState<RemoveMemberScope | null>(null);

    // Every opening starts unpicked, so a second removal never inherits the first one's choice.
    useEffect(() => {
        if (open) setPicked(null);
    }, [open]);

    const title = t('chat.settings.removeScope.title', { name: memberName });
    const description = t('chat.settings.removeScope.description', { name: memberName });

    const options: Record<RemoveMemberScope, { label: string; detail: string }> = {
        room: {
            label: t('chat.settings.removeScope.room.label', { room: roomName ?? '' }),
            detail: t('chat.settings.removeScope.room.description'),
        },
        place: {
            label: t('chat.settings.removeScope.place.label', { place: placeName ?? '' }),
            detail: t('chat.settings.removeScope.place.description'),
        },
    };

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={title}
            description={description}
            onClose={() => onOpenChange(false)}
            closeLabel={t('chat.settings.close')}
            footer={
                <div className="px-4 pb-4 pt-5">
                    <Button
                        tone="green"
                        size="lg"
                        fullWidth
                        disabled={!picked}
                        onClick={() => picked && onChoose(picked)}
                    >
                        {t('chat.settings.removeMember')}
                    </Button>
                </div>
            }
        >
            <div className="flex flex-col gap-2 pt-2">
                <p aria-hidden className="px-4 text-[15px] leading-[22px] text-description">
                    {description}
                </p>
                <div role="radiogroup" aria-label={title}>
                    {scopes.map(scope => {
                        const selected = picked === scope;
                        return (
                            <ListRow
                                key={scope}
                                role="radio"
                                aria-checked={selected}
                                title={options[scope].label}
                                subtitle={options[scope].detail}
                                onClick={() => setPicked(scope)}
                                trailing={
                                    <span
                                        className={cn(
                                            'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                                            selected ? 'border-main-accent' : 'border-placeholder'
                                        )}
                                    >
                                        {selected && <span className="size-2.5 rounded-full bg-main-accent" />}
                                    </span>
                                }
                            />
                        );
                    })}
                </div>
            </div>
        </BottomSheet>
    );
};
