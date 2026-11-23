import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useNavigateWithTransition } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { FloatingButton, SearchInput, SelectableUserItem, SelectedAvatarRow } from '@chatic/web-ui-kit';

import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';

import {
    LIST_PROFILE_SYNC_INTERVAL_MS,
    useChannelMutations,
    useChannelProfiles,
    useInviteCandidates,
    useUserRecords,
} from '../hooks';
import { type DisplayNameSources, resolveUserName } from '../utils/displayName';

const NO_PROFILE_TARGETS: string[] = [];

interface PlaceInviteTabProps {
    channelId: string;
    sid: string | null;
    maxSelection: number;
    onLimitReached?: () => void;
}

export const PlaceInviteTab = ({ channelId, sid, maxSelection, onLimitReached }: PlaceInviteTabProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();

    const { inviteChannel } = useChannelMutations();
    const { candidateIds, memberById, fromPlaceList, isLoading } = useInviteCandidates(channelId, sid);
    const { profileMap } = useChannelProfiles(
        sid,
        fromPlaceList ? NO_PROFILE_TARGETS : candidateIds,
        LIST_PROFILE_SYNC_INTERVAL_MS
    );

    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isInviting, setIsInviting] = useState(false);

    const userRecords = useUserRecords(candidateIds);
    const memberRecords = useMemo(() => new Map([...memberById, ...userRecords]), [memberById, userRecords]);

    const nameSources: DisplayNameSources = useMemo(
        () => ({
            profileMap,
            memberById: memberRecords,
            unknownLabel: t('chat.unknownUser'),
            meLabel: t('chat.me'),
        }),
        [profileMap, memberRecords, t]
    );
    const nameOf = useCallback((id: string) => resolveUserName(id, nameSources), [nameSources]);

    const candidates = useMemo(
        () =>
            candidateIds.map(id => ({
                id,
                name: nameOf(id),
                avatarSrc: profileMap.get(id)?.thumbnail || memberById.get(id)?.thumbnail || undefined,
            })),
        [candidateIds, nameOf, profileMap, memberById]
    );

    const visible = useMemo(() => {
        const picked = candidates.filter(c => selectedIds.has(c.id));
        let rest = candidates.filter(c => !selectedIds.has(c.id));
        const query = search.trim().toLowerCase();
        if (query) rest = rest.filter(c => c.name.toLowerCase().includes(query) || c.id.toLowerCase().includes(query));
        return [...picked, ...rest];
    }, [candidates, selectedIds, search]);

    const hasSelection = selectedIds.size > 0;

    const handleToggle = useCallback(
        (userId: string, next: boolean) => {
            if (isInviting) return;
            if (next && selectedIds.size >= maxSelection && !selectedIds.has(userId)) {
                if (onLimitReached) onLimitReached();
                else toast({ title: t('inviteFriends.limitToast', { max: maxSelection }) });
                return;
            }
            setSelectedIds(prev => {
                if (next && prev.size >= maxSelection && !prev.has(userId)) return prev;
                const updated = new Set(prev);
                if (next) updated.add(userId);
                else updated.delete(userId);
                return updated;
            });
        },
        [isInviting, selectedIds, maxSelection, onLimitReached, toast, t]
    );

    const removeSelected = useCallback((id: string) => {
        setSelectedIds(prev => {
            const updated = new Set(prev);
            updated.delete(id);
            return updated;
        });
    }, []);

    const handleInvite = async () => {
        if (!hasSelection || isInviting) return;
        setIsInviting(true);
        try {
            await inviteChannel({ channelId, userIds: Array.from(selectedIds) });
            toast({ title: t('inviteFriends.placeSuccess', { count: selectedIds.size }) });
            navigate(-1);
        } catch (error) {
            logger.error('INVITE', '[PlaceInviteTab] adding members failed', { error });
            const message = error instanceof Error ? error.message : t('inviteFriends.placeFailed');
            toast({ title: message, variant: 'destructive' });
        } finally {
            setIsInviting(false);
        }
    };

    if (!isLoading && candidateIds.length === 0) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 px-8">
                <p className="text-center text-[16px] text-description">{t('inviteFriends.noPlaceCandidates')}</p>
                <p className="text-center text-[14px] text-placeholder">{t('inviteFriends.noPlaceCandidatesHint')}</p>
            </div>
        );
    }

    return (
        <>
            <div className="shrink-0 px-4 pt-2">
                <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder={t('inviteFriends.searchPlaceholder')}
                    label={t('inviteFriends.searchPlaceholder')}
                />

                <div className="flex items-center justify-between gap-2 pt-4">
                    <span className="flex items-center gap-2 text-[18px] font-semibold leading-[25px] tracking-[-0.5px] text-foreground">
                        {t('inviteFriends.selectTitle')}
                        <span className="text-placeholder">
                            <span className={hasSelection ? 'text-foreground' : undefined}>{selectedIds.size}</span>/
                            {maxSelection}
                        </span>
                    </span>
                    <button
                        type="button"
                        onClick={() => setSelectedIds(new Set())}
                        disabled={!hasSelection}
                        className="shrink-0 text-[15px] font-medium leading-[25px] tracking-[-0.5px] text-foreground underline disabled:text-placeholder"
                    >
                        {t('inviteFriends.deselectAll')}
                    </button>
                </div>

                {hasSelection && (
                    <div className="mb-2 mt-4 h-[90px] overflow-hidden rounded-[8px] bg-secondary">
                        <SelectedAvatarRow
                            items={candidates.filter(c => selectedIds.has(c.id))}
                            onRemove={removeSelected}
                            removeLabel={t('inviteFriends.deselectAll')}
                            className="h-full items-center px-3 py-0"
                        />
                    </div>
                )}
            </div>

            <div className="flex flex-1 flex-col overflow-y-auto overscroll-none px-2 pt-2">
                {visible.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center">
                        {!isLoading && search.trim() && (
                            <p className="text-center text-[16px] text-description">
                                {t('inviteFriends.noSearchResults')}
                            </p>
                        )}
                    </div>
                ) : (
                    visible.map(candidate => (
                        <SelectableUserItem
                            key={candidate.id}
                            name={candidate.name}
                            avatarSrc={candidate.avatarSrc}
                            checked={selectedIds.has(candidate.id)}
                            onToggle={next => handleToggle(candidate.id, next)}
                            disabled={isInviting}
                        />
                    ))
                )}
            </div>

            <FloatingButton
                label={t('inviteFriends.done')}
                loading={isInviting}
                disabled={!hasSelection}
                onClick={handleInvite}
                wrapperClassName="shrink-0"
            />
            <KeyboardSafeAreaSpacer />
        </>
    );
};
