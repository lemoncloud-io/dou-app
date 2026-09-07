import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { logger } from '@chatic/bridges';
import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useNavigateWithTransition } from '@chatic/shared';
import type { DomainUser } from '@chatic/data';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { FloatingButton, SearchInput, SelectableUserItem, SelectedAvatarRow } from '@chatic/web-ui-kit';

import { KeyboardSafeAreaSpacer } from '../../../ui/layouts/KeyboardSafeAreaSpacer';

import { LIST_PROFILE_SYNC_INTERVAL_MS, useChannelMutations, useChannelProfiles, useInviteCandidates } from '../hooks';

interface PlaceInviteTabProps {
    channelId: string;
    /** The target channel's site. Candidates and their profiles are both scoped to it. */
    sid: string | null;
    /** One invite adds at most this many people — shared with the contact tab's batch cap. */
    maxSelection: number;
}

/**
 * Add people who are already in this place to the channel.
 *
 * The pool comes from {@link useInviteCandidates} (a pure derivation over the channel cache, no
 * requests) and each row is drawn with that person's PLACE profile, so somebody picked here reads
 * the same as they will in the room's member list. Confirming calls `channel.invite` once for the
 * whole selection; the repository owns the optimistic membership write and its rollback, so this
 * component only has to report the outcome. See ADR-0075.
 */
export const PlaceInviteTab = ({ channelId, sid, maxSelection }: PlaceInviteTabProps) => {
    const { t } = useTranslation();
    const { toast } = useToast();
    const navigate = useNavigateWithTransition();

    const { inviteChannel } = useChannelMutations();
    const { candidateIds, isLoading } = useInviteCandidates(channelId, sid);
    /**
     * Same machinery the room uses for its member list: observe the site's profiles and one-shot
     * the ones the cache is missing, so a never-seen candidate still gets a name instead of an id.
     *
     * On the LIST cadence, not the room's. One sync target is registered per candidate, and this
     * pool is the union across every room I am in — larger than any single member list. A nick
     * changing while somebody picks people does not matter, so the picker polls at the slow rate
     * the other list surfaces use; first paint still comes from the one-shot bootstrap.
     */
    const { profileMap } = useChannelProfiles(sid, candidateIds, LIST_PROFILE_SYNC_INTERVAL_MS);

    const [search, setSearch] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isInviting, setIsInviting] = useState(false);

    /**
     * Middle rung of the name chain below.
     *
     * Read one id at a time rather than observed as a list: `observeList` is keyed by `channelId`
     * (`ChannelListUserRequestData` requires it) and these candidates come from many channels, so
     * there is no single scoped query that covers them. A per-id `cacheRead` is a supported call
     * and runs once per candidate set — no observers, no network.
     *
     * This is only a fallback. The place profile above is the primary source and
     * `useChannelProfiles` actively bootstraps the ones the cache is missing, so most rows never
     * reach here.
     */
    const { user: userRepository } = useRuntimeRepositories();
    const [userNames, setUserNames] = useState<Map<string, string>>(new Map());
    const candidateKey = candidateIds.join(',');
    useEffect(() => {
        let cancelled = false;
        void Promise.all(candidateIds.map(id => userRepository.cacheRead(id).catch(() => null))).then(
            (users: Array<DomainUser | null>) => {
                if (cancelled) return;
                const next = new Map<string, string>();
                users.forEach(user => {
                    if (user?.id && user.name) next.set(user.id, user.name);
                });
                setUserNames(next);
            }
        );
        return () => {
            cancelled = true;
        };
        // `candidateKey` stands in for the id array so a re-derived array of the same ids does not
        // re-read the cache on every render.
    }, [userRepository, candidateKey]);

    /**
     * Display name for a candidate, falling down the same chain the settings member row uses
     * (place nick → user record name → raw id). Keeping the chains identical is what stops the
     * same person reading one way in the picker and another way in the member list.
     */
    const nameOf = useCallback(
        (userId: string) => profileMap.get(userId)?.nick?.trim() || userNames.get(userId) || userId,
        [profileMap, userNames]
    );

    const candidates = useMemo(
        () =>
            candidateIds.map(id => ({
                id,
                name: nameOf(id),
                avatarSrc: profileMap.get(id)?.thumbnail || undefined,
            })),
        [candidateIds, nameOf, profileMap]
    );

    // Picked people stay pinned above the filtered rest, matching the contact tab.
    const visible = useMemo(() => {
        const picked = candidates.filter(c => selectedIds.has(c.id));
        let rest = candidates.filter(c => !selectedIds.has(c.id));
        const query = search.trim().toLowerCase();
        // The id is matched too: pasting a user id is the way to reach somebody whose nick you do
        // not know, which is the only thing the removed manual-id entry would have bought.
        if (query) rest = rest.filter(c => c.name.toLowerCase().includes(query) || c.id.toLowerCase().includes(query));
        return [...picked, ...rest];
    }, [candidates, selectedIds, search]);

    const hasSelection = selectedIds.size > 0;

    const handleToggle = useCallback(
        (userId: string, next: boolean) => {
            if (isInviting) return;
            setSelectedIds(prev => {
                if (next && prev.size >= maxSelection && !prev.has(userId)) {
                    toast({ title: t('inviteFriends.limitToast', { max: maxSelection }) });
                    return prev;
                }
                const updated = new Set(prev);
                if (next) updated.add(userId);
                else updated.delete(userId);
                return updated;
            });
        },
        [isInviting, maxSelection, toast, t]
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

    // A place where I have no other room — or whose every member is already here — has nothing to
    // offer. Say so and point at the tab that can still reach someone, rather than a blank panel.
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
                    // Only a search can empty this list once loaded — an unsearched empty pool took
                    // the early return above. While the pool is still loading the panel stays blank
                    // rather than claiming a search found nothing.
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
            {/* This tab has a search field too, so the CTA needs the same home-indicator inset and
                keyboard lift the contact tab gets. */}
            <KeyboardSafeAreaSpacer />
        </>
    );
};
