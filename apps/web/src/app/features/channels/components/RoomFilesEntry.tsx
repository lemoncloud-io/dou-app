import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { RoomFilesSummary } from '@chatic/web-ui-kit';

import { ROUTES } from '../../../routes/paths';
import { useRoomMediaCounts } from '../hooks/useRoomFiles';
import { ROOM_FILES_TABS, TAB_KINDS } from '../utils/roomFiles';

/**
 * The room settings' "Room files" area (Figma 6067:22063): four cells with how many of each kind this
 * device has found, each opening the file list on its tab. The counts are this device's cache, not
 * the room's total — the list says so by offering to find older files.
 *
 * Not drawn at all where the installed app cannot answer the count yet (an app that owns the session
 * and predates the room's media reads): a missing feature reads better than an empty list.
 */
export const RoomFilesEntry = ({ cid, channelId }: { cid: string | undefined; channelId: string }) => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { counts, unavailable } = useRoomMediaCounts(cid, channelId);
    if (unavailable) return null;

    return (
        <RoomFilesSummary
            title={t('chat.files.title')}
            seeAllLabel={t('chat.files.seeAll')}
            onSeeAll={() => navigate(ROUTES.channels.files(channelId))}
            loading={!counts}
            items={ROOM_FILES_TABS.map(key => ({
                key,
                label: t(`chat.files.tab.${key}`),
                count: counts ? TAB_KINDS[key].reduce((sum, kind) => sum + (counts[kind] ?? 0), 0) : 0,
                accent: key === 'audio',
            }))}
            onSelect={key => navigate(ROUTES.channels.files(channelId, key))}
        />
    );
};
