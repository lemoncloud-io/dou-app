import type { CloudChannel, CloudChat, CloudList, CloudProfile } from '@chatic/chatic-apps-sdk';
import type { MockData } from '@chatic/chatic-apps-sdk/mock';

/**
 * Made-up data for the mock: the cloud, the place, its rooms, messages and members as the app would
 * answer them. Every id and name here is invented — never put a real cloud's in a fixture. The scenario
 * runner reads the same data (`chatic-apps.scenarios.ts`), so the page is tried against what it is
 * developed against.
 */

const CLOUD = 'cloud-example';
const PLACE = 'place-example';
const ME = 'user-me';

const listOf = <Row>(rows: Row[]): CloudList<Row> => ({ list: rows, meta: { total: rows.length } });

const room = (id: string, name: string): CloudChannel => ({
    id,
    cid: CLOUD,
    sid: PLACE,
    isNotificationEnabled: true,
    name,
});

const ROOMS: CloudChannel[] = [room('room-lobby', 'Lobby'), room('room-notes', 'Notes'), room('room-games', 'Games')];

const message = (channelId: string, chatNo: number, content: string): CloudChat => ({
    id: `${channelId}-chat-${chatNo}`,
    cid: CLOUD,
    channelId,
    chatNo,
    isPending: false,
    isFailed: false,
    createdAtMs: 1_700_000_000_000 + chatNo * 60_000,
    updatedAtMs: 1_700_000_000_000 + chatNo * 60_000,
    content,
});

const profile = (userId: string, nick: string): CloudProfile => ({
    id: `${PLACE}@${userId}`,
    cid: CLOUD,
    sid: PLACE,
    uid: userId,
    userId,
    updatedAtMs: 1_700_000_000_000,
    nick,
});

const PROFILES: CloudProfile[] = [profile(ME, 'Example Me'), profile('user-two', 'Member Two')];

export const mockData: MockData = {
    session: {
        context: {
            cloud: { cloudId: CLOUD, siteId: PLACE, isActive: true },
            identity: { userId: ME, isAuthenticated: true },
        },
        committedSiteId: PLACE,
    },
    calls: {
        'cloud.getCloud': ({ id }) => ({ id, cid: id, name: 'Example Cloud' }),
        'place.cacheReadList': () => listOf([{ id: PLACE, cid: CLOUD, order: 0, name: 'Example Place' }]),
        'chat.cacheReadList': ({ channelId }) =>
            listOf([message(channelId, 1, 'Hello from the mock'), message(channelId, 2, 'A second message')]),
        'profile.cacheRead': id => PROFILES.find(row => row.id === id) ?? null,
        'profile.cacheReadList': () => listOf(PROFILES),
    },
    streams: {
        'channel.observeList': emit => {
            emit(listOf(ROOMS));
            return () => undefined;
        },
        'profile.observeItem': (emit, id) => {
            emit(PROFILES.find(row => row.id === id) ?? null);
            return () => undefined;
        },
    },
};
