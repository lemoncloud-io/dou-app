import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useToast } from '@chatic/ui-kit/components/ui/use-toast';
import {
    GroupLabel,
    IconSpinner,
    ModalTopBar,
    SearchInput,
    SelectableUserItem,
    SelectedAvatarRow,
} from '@chatic/web-ui-kit';

import { matchDestinations, type ShareDestination } from '../hooks/useShareDestinations';

interface DestinationPickerProps {
    destinations: ShareDestination[];
    isLoading: boolean;
    /** The selection the picker opens with; nothing changes until Done. */
    initial: string[];
    max: number;
    onCancel: () => void;
    onDone: (ids: string[]) => void;
}

const TEXT_ACTION = 'whitespace-nowrap px-1 text-[15px] font-medium text-foreground';

/**
 * The "To" list: every room the share can go to, searchable by name, picked up to `max`. Picks are
 * a draft — Cancel leaves the composer's selection as it was.
 */
export const DestinationPicker = ({
    destinations,
    isLoading,
    initial,
    max,
    onCancel,
    onDone,
}: DestinationPickerProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const [query, setQuery] = useState('');
    const [picked, setPicked] = useState<string[]>(initial);

    const byId = useMemo(() => new Map(destinations.map(destination => [destination.id, destination])), [destinations]);
    const visible = useMemo(() => matchDestinations(destinations, query), [destinations, query]);
    const people = visible.filter(destination => destination.kind !== 'group');
    const groups = visible.filter(destination => destination.kind === 'group');

    const toggle = (id: string, next: boolean) => {
        if (!next) {
            setPicked(prev => prev.filter(pickedId => pickedId !== id));
            return;
        }
        if (picked.includes(id)) return;
        if (picked.length >= max) {
            toast({ title: t('share.limit', { max }) });
            return;
        }
        setPicked(prev => [...prev, id]);
    };

    const row = (destination: ShareDestination) => (
        <SelectableUserItem
            key={destination.id}
            name={destination.title}
            avatarSrc={destination.avatarSrc}
            checked={picked.includes(destination.id)}
            onToggle={next => toggle(destination.id, next)}
        />
    );

    const pickedItems = picked
        .map(id => byId.get(id))
        .filter((destination): destination is ShareDestination => !!destination)
        .map(destination => ({ id: destination.id, name: destination.title, avatarSrc: destination.avatarSrc }));

    return (
        <div className="flex h-full flex-col bg-background">
            <ModalTopBar
                title={t('share.to')}
                leftSlot={
                    <button type="button" onClick={onCancel} className={TEXT_ACTION}>
                        {t('share.cancel')}
                    </button>
                }
                rightSlot={
                    <button type="button" onClick={() => onDone(picked)} className={TEXT_ACTION}>
                        {t('share.done')}
                    </button>
                }
                divider
            />

            <div className="shrink-0 px-4 pt-2">
                <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder={t('share.searchPlaceholder')}
                    label={t('share.searchPlaceholder')}
                />
                {pickedItems.length > 0 && (
                    <div className="mt-3 h-[90px] overflow-hidden rounded-[8px] bg-secondary">
                        <SelectedAvatarRow
                            items={pickedItems}
                            onRemove={id => toggle(id, false)}
                            removeLabel={t('share.removeDestination')}
                            className="h-full items-center px-3 py-0"
                        />
                    </div>
                )}
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto overscroll-none px-2 pb-[calc(var(--safe-bottom,0px)+1rem)] pt-2">
                {visible.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center">
                        {isLoading ? (
                            <div role="status" className="text-description">
                                <IconSpinner className="size-6 animate-spin" />
                                <span className="sr-only">{t('share.loadingDestinations')}</span>
                            </div>
                        ) : (
                            <p className="text-center text-[16px] text-description">
                                {query.trim() ? t('share.noResults') : t('share.noDestinations')}
                            </p>
                        )}
                    </div>
                ) : (
                    <>
                        {people.length > 0 && <GroupLabel label={t('share.groupPeople')} />}
                        {people.map(row)}
                        {groups.length > 0 && <GroupLabel label={t('share.groupChannels')} />}
                        {groups.map(row)}
                    </>
                )}
            </div>
        </div>
    );
};
