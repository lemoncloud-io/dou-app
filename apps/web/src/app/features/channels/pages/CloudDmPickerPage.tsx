import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime-react';
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

export const CloudDmPickerPage = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();

    const { selectedSiteId } = runtime.session.useSessionSelection();
    const { userId } = runtime.session.useSessionIdentity();
    const cid = useSelectedCloudId();
    const myUid = runtime.session.useUidInCloud(cid);
    const isMe = useCallback((id: string) => !!id && (id === myUid || id === userId), [myUid, userId]);

    const { startDm, isStarting, isAvailable } = useStartDm();

    useEffect(() => {
        if (!isAvailable) navigate(ROUTES.home, { replace: true });
    }, [isAvailable, navigate]);

    const { members, status, retry } = usePlaceMembers(isAvailable ? (selectedSiteId ?? null) : null);
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
