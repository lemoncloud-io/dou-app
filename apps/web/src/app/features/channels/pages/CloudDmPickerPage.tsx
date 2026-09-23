import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { DefaultAvatar, ImageAvatar, ListRow, SearchInput, Text } from '@chatic/web-ui-kit';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { PageHeader } from '../../../ui/components';
import {
    LIST_PROFILE_SYNC_INTERVAL_MS,
    useChannelProfiles,
    useCloudDmCandidates,
    useStartDm,
    useUserRecords,
} from '../hooks';
import { type DisplayNameSources, resolveUserName } from '../utils/displayName';

const AVATAR_SIZE = 40;

/**
 * Pick the person to open a cloud 1:1 with.
 *
 * **Provisional layout.** No design exists for this screen, so it is assembled from web-ui-kit
 * primitives — the same ones `PlaceInviteTab` uses — rather than inventing a look. What is settled
 * here is the behaviour, not the appearance: when a comp arrives, the rows and the shell change and
 * everything below this paragraph stays.
 *
 * **One tap, not a selection.** The nearest precedent (`PlaceInviteTab`) collects several people
 * and confirms, because an invite is a batch. This opens one room, so a row IS the action and there
 * is no confirm step to get wrong.
 *
 * **The list is not a directory.** Candidates are people who share a room with me somewhere in this
 * cloud (see `useCloudDmCandidates`); the server has no user directory to ask. The empty state says
 * that rather than implying nobody is here.
 *
 * Names come from `resolveUserName`, the one chain every other surface calls, read under the place
 * this reader is standing in — which is the same place the room itself will name the peer under
 * once it opens.
 */
export const CloudDmPickerPage = () => {
    const { t } = useTranslation();
    const { toast } = useToast();

    // A cloud 1:1 has no place of its own, so its people are named under the reader's current one.
    const { selectedSiteId } = runtime.session.useSessionSelection();

    const { candidateIds, isLoading } = useCloudDmCandidates();
    const { profileMap } = useChannelProfiles(selectedSiteId ?? null, candidateIds, LIST_PROFILE_SYNC_INTERVAL_MS);
    const userRecords = useUserRecords(candidateIds);
    const { startDm, isStarting } = useStartDm();

    const [search, setSearch] = useState('');

    const nameSources: DisplayNameSources = useMemo(
        () => ({
            profileMap,
            memberById: userRecords,
            unknownLabel: t('chat.unknownUser'),
            meLabel: t('chat.me'),
        }),
        [profileMap, userRecords, t]
    );
    const nameOf = useCallback((id: string) => resolveUserName(id, nameSources), [nameSources]);

    const candidates = useMemo(
        () =>
            candidateIds.map(id => ({
                id,
                name: nameOf(id),
                avatarSrc: profileMap.get(id)?.thumbnail || undefined,
            })),
        [candidateIds, nameOf, profileMap]
    );

    const visible = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return candidates;
        // The id is matched too, the same way the invite picker does it: pasting a user id reaches
        // somebody whose nick you do not know.
        return candidates.filter(
            candidate => candidate.name.toLowerCase().includes(query) || candidate.id.toLowerCase().includes(query)
        );
    }, [candidates, search]);

    // `startDm` navigates on success and answers `null` on failure, so this screen only has to say
    // that it failed — and its own re-entry guard means a second tap while one is in flight is a
    // no-op rather than a second room.
    const handlePick = async (peerId: string) => {
        const channel = await startDm(peerId);
        if (!channel) toast({ title: t('cloudDm.picker.failed') });
    };

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

            <div className="flex-1 overflow-y-auto">
                {isLoading ? null : visible.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
                        <Text className="text-muted-foreground">
                            {search.trim() ? t('cloudDm.picker.noMatch') : t('cloudDm.picker.empty')}
                        </Text>
                        {!search.trim() && (
                            <Text className="text-sm text-muted-foreground">{t('cloudDm.picker.emptyHint')}</Text>
                        )}
                    </div>
                ) : (
                    visible.map(candidate => (
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
                            onClick={() => void handlePick(candidate.id)}
                        />
                    ))
                )}
            </div>
        </div>
    );
};
