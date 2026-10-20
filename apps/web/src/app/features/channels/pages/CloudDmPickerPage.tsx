import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { useNavigateWithTransition } from '@chatic/shared';
import { DefaultAvatar, ImageAvatar, ListRow, SearchInput, Text } from '@chatic/web-ui-kit';

import { useSelectedCloudId } from '../../../hooks';
import { ROUTES } from '../../../routes/paths';
import { PageHeader } from '../../../ui/components';
import { usePlaceMembers } from '../../place/hooks/usePlaceMembers';
import { useChannelProfiles, useStartDm } from '../hooks';
import { type DisplayNameSources, resolveUserName } from '../utils/displayName';

const AVATAR_SIZE = 40;
const NO_PROFILE_TARGETS: string[] = [];

/**
 * Pick the person to open a cloud 1:1 with — reached from the ＋ on home's 1:1 section.
 *
 * **The people are the members of the place the session is on** (`place.list-user`), the list the
 * place's member screen shows. A cloud 1:1 belongs to the place it is opened in, so a candidate from
 * anywhere else would open a room in this place with somebody who is not in it. Desktop's picker
 * reads the same list.
 *
 * **One tap, not a selection.** An invite collects several people and confirms; this opens one room,
 * so a row IS the action and there is no confirm step to get wrong.
 *
 * **Provisional layout.** No design exists for this screen, so it is assembled from web-ui-kit
 * primitives. What is settled is the behaviour; when a comp arrives the rows and the shell change.
 *
 * Names come from `resolveUserName` under this place's profiles — the place the room will name the
 * peer under once it opens.
 *
 * When the list cannot be had it shows an error and a retry, and never a stand-in such as the union of
 * my rooms' rosters: those span places, and a wrong candidate opens a room in this place with someone
 * outside it.
 *
 * **Reachable only where a cloud 1:1 can open.** Home offers it from a cloud place, but the route can
 * still be reached elsewhere — back after a push moved the session to the relay, or with no place — so
 * there the screen goes home instead of listing people a tap could never reach.
 */
export const CloudDmPickerPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();

    const { selectedSiteId } = runtime.session.useSessionSelection();
    const { userId } = runtime.session.useSessionIdentity();
    const cid = useSelectedCloudId();
    // The place list names me by my id in this cloud; the session id is checked too in case the two differ.
    const myUid = runtime.session.useUidInCloud(cid);
    const isMe = useCallback((id: string) => !!id && (id === myUid || id === userId), [myUid, userId]);

    const { startDm, isStarting, isAvailable } = useStartDm();

    useEffect(() => {
        if (!isAvailable) navigate(ROUTES.home, { replace: true });
    }, [isAvailable, navigate]);

    const { members, status, retry } = usePlaceMembers(isAvailable ? (selectedSiteId ?? null) : null);
    // The cached profiles of this place. No ids: the member list already loaded what it could.
    const { profileMap } = useChannelProfiles(selectedSiteId ?? null, NO_PROFILE_TARGETS);

    const [search, setSearch] = useState('');

    const peers = useMemo(() => members.filter(member => !isMe(member.id)), [members, isMe]);
    const memberById = useMemo(() => new Map(peers.map(member => [member.id, member])), [peers]);
    const nameSources: DisplayNameSources = useMemo(
        () => ({
            profileMap,
            memberById,
            userId: myUid ?? userId,
            unknownLabel: t('chat.unknownUser'),
            meLabel: t('chat.me'),
        }),
        [profileMap, memberById, myUid, userId, t]
    );

    const candidates = useMemo(
        () =>
            peers.map(member => ({
                id: member.id,
                name: resolveUserName(member.id, nameSources),
                avatarSrc: profileMap.get(member.id)?.thumbnail || member.thumbnail || undefined,
            })),
        [peers, nameSources, profileMap]
    );

    const visible = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return candidates;
        return candidates.filter(candidate => candidate.name.toLowerCase().includes(query));
    }, [candidates, search]);

    const renderBody = () => {
        if (status === 'loading') {
            return (
                <div role="status" className="py-4 text-center text-sm text-muted-foreground">
                    {t('cloudDm.picker.loading')}
                </div>
            );
        }
        if (status === 'error' || status === 'forbidden') {
            return (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                    <p className="text-sm text-destructive">{t('cloudDm.picker.loadFailed')}</p>
                    <button type="button" onClick={retry} className="text-sm text-primary underline">
                        {t('cloudDm.picker.retry')}
                    </button>
                </div>
            );
        }
        if (visible.length === 0) {
            return (
                <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
                    <Text className="text-muted-foreground">
                        {search.trim() ? t('cloudDm.picker.noMatch') : t('cloudDm.picker.empty')}
                    </Text>
                    {!search.trim() && (
                        <Text className="text-sm text-muted-foreground">{t('cloudDm.picker.emptyHint')}</Text>
                    )}
                </div>
            );
        }
        return visible.map(candidate => (
            <ListRow
                key={candidate.id}
                leading={
                    candidate.avatarSrc ? (
                        <ImageAvatar src={candidate.avatarSrc} size={AVATAR_SIZE} alt="" />
                    ) : (
                        <DefaultAvatar size={AVATAR_SIZE} />
                    )
                }
                title={candidate.name}
                disabled={isStarting}
                // `startDm` navigates on success and says so itself on failure; its re-entry guard
                // makes a second tap while one is in flight a no-op. The room replaces this screen, so
                // back from it returns to home rather than to the picker.
                onClick={() => void startDm(candidate.id, { replace: true })}
            />
        ));
    };

    if (!isAvailable) return null;

    return (
        <div className="flex h-full flex-col bg-background">
            <PageHeader title={t('cloudDm.picker.title')} />

            <div className="px-4 py-3">
                <SearchInput
                    value={search}
                    onChange={setSearch}
                    placeholder={t('cloudDm.picker.searchPlaceholder')}
                    label={t('cloudDm.picker.searchPlaceholder')}
                />
            </div>

            <div className="flex-1 overflow-y-auto pb-safe-bottom">{renderBody()}</div>
        </div>
    );
};
