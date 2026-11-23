import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { BottomSheet, Button, ListRow } from '@chatic/web-ui-kit';

export type RemoveMemberScope = 'room' | 'place';

interface RemoveMemberScopeSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    memberName: string;
    roomName?: string;
    placeName?: string;
    scopes: readonly RemoveMemberScope[];
    onChoose: (scope: RemoveMemberScope) => void;
}

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
