import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { RoomFilesSummary } from '@chatic/web-ui-kit';

import { ROUTES } from '../../../routes/paths';
import { useRoomMediaCounts } from '../hooks/useRoomFiles';
import { ROOM_FILES_TABS, TAB_KINDS } from '../utils/roomFiles';

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
