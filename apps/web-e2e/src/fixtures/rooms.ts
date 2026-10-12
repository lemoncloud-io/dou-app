import { SocketRefusal, type FakeBackend, type SocketHandler } from './backend';
import { GUEST, SELF_CHANNEL, selfJoin } from './guest';

/**
 * Rooms beyond a new guest's self chat, for the scenarios that move between rooms — a push tap from
 * one into another, a resume inside a room with history. Like `guest.ts`, every value is invented.
 */

/** The other person in the guest's one 1:1. */
export const MINA = { uid: '900002', nick: 'Mina' } as const;

/**
 * A relay 1:1 the guest joined through Mina's invite. Its title on screen is the guest's own name for
 * the room (`$join.nick`), which a relay invite seeds with the name the sender typed.
 */
export const DM_CHANNEL = {
    id: 'e2e-dm-mina',
    name: MINA.nick,
    stereo: 'dm',
    sid: GUEST.sid,
    $: { sid: GUEST.sid },
    ownerId: MINA.uid,
    memberNo: 2,
    chatNo: 1,
    memberIds: [GUEST.uid, MINA.uid],
    createdAt: GUEST.createdAt,
    updatedAt: GUEST.createdAt,
    $join: { nick: MINA.nick },
};

/** A message as the relay's `chat.feed` lists it. Numbered, so its time and order are fixed. */
export const chatView = (channelId: string, chatNo: number, content: string, ownerId: string = MINA.uid) => ({
    id: `${channelId}:${chatNo}`,
    channelId,
    chatNo,
    content,
    stereo: 'text',
    ownerId,
    owner$: { id: ownerId, name: ownerId === MINA.uid ? MINA.nick : GUEST.uid },
    createdAt: GUEST.createdAt + chatNo * 60_000,
    updatedAt: GUEST.createdAt + chatNo * 60_000,
});

/** What Mina had said before any scenario starts. */
export const DM_FIRST_MESSAGE = 'Are we still on for Friday?';

export interface FixtureRoom {
    channel: { id: string; chatNo: number } & Record<string, unknown>;
    /** Who is in it — each with the membership row the relay embeds. */
    members: { id: string; name: string }[];
    /** Its messages, oldest first. Read on every `chat.feed`, so a scenario can add to it mid-run. */
    chats: ReturnType<typeof chatView>[];
    /** The guest left it: gone from their list, but the relay still serves the room itself. */
    left?: boolean;
}

/** The 1:1 with Mina, with her one message. A fresh copy each call: scenarios add to `chats`. */
export const dmRoom = (): FixtureRoom => ({
    channel: { ...DM_CHANNEL },
    members: [
        { id: GUEST.uid, name: GUEST.uid },
        { id: MINA.uid, name: MINA.nick },
    ],
    chats: [chatView(DM_CHANNEL.id, 1, DM_FIRST_MESSAGE)],
});

/** Another person, whose 1:1 with the guest the guest has since left. */
export const JUNO = { uid: '900003', nick: 'Juno' } as const;

/**
 * A 1:1 the guest has left, as the relay answers for it afterwards (measured on the dev relay, see
 * `isNotMyChannel` in apps/web): the room and its messages are still served to them, and the only
 * sign of the departure is on the row — the guest is gone from `memberIds`, and their join reads
 * `joined: 0`. It is no longer in their channel list.
 */
export const leftDmRoom = (): FixtureRoom => ({
    channel: {
        id: 'e2e-dm-juno',
        name: JUNO.nick,
        stereo: 'dm',
        sid: GUEST.sid,
        $: { sid: GUEST.sid },
        ownerId: JUNO.uid,
        memberNo: 1,
        chatNo: 1,
        memberIds: [JUNO.uid],
        createdAt: GUEST.createdAt,
        updatedAt: GUEST.createdAt,
    },
    members: [{ id: JUNO.uid, name: JUNO.nick }],
    chats: [chatView('e2e-dm-juno', 1, 'See you around.', JUNO.uid)],
    left: true,
});

const joinOf = (channelId: string, userId: string, chatNo = 0, joined = 1) => ({
    id: `${channelId}@${userId}`,
    channelId,
    userId,
    joined,
    chatNo,
});

/** The id a room request names: `channel.get` sends `id`, the rest send `channelId`. */
const channelIdOf = (data: unknown): string | undefined => {
    const payload = (data ?? {}) as { id?: string; channelId?: string };
    return payload.channelId ?? payload.id;
};

/**
 * The relay's handlers for the self chat plus `rooms` — the channel list, each room, its members and
 * its feed — to pass to `backend.useSocket`. A room id it has never heard of is refused on every
 * read, as the relay refuses a room the guest was never in.
 */
export const roomsSocket = (backend: FakeBackend, rooms: FixtureRoom[]): Record<string, SocketHandler> => {
    const byId = new Map(rooms.map(room => [room.channel.id, room]));
    const listed = [SELF_CHANNEL, ...rooms.filter(room => !room.left).map(room => room.channel)];
    /** The room a request names: `null` for the self chat, a refusal for an id nobody knows. */
    const roomOf = (data: unknown): FixtureRoom | null => {
        const id = channelIdOf(data) ?? '';
        if (id === SELF_CHANNEL.id) return null;
        const room = byId.get(id);
        if (!room) throw new SocketRefusal(`403 FORBIDDEN - not a member of channel[${id}]`);
        return room;
    };
    return {
        'channel.sync': () => ({ list: listed, ids: listed.map(c => c.id), syncedAt: GUEST.createdAt }),
        'channel.get': data => roomOf(data)?.channel ?? SELF_CHANNEL,
        'channel.sync-users': data => {
            const room = roomOf(data);
            const members = room?.members ?? [{ id: GUEST.uid, name: backend.deviceId }];
            const channelId = room?.channel.id ?? SELF_CHANNEL.id;
            return {
                list: members.map(member => ({ ...member, $join: joinOf(channelId, member.id) })),
                ids: members.map(member => member.id),
                syncedAt: GUEST.createdAt,
            };
        },
        'join.get': data => {
            const room = roomOf(data);
            if (!room) return selfJoin;
            return joinOf(room.channel.id, GUEST.uid, room.channel.chatNo, room.left ? 0 : 1);
        },
        // Reading a room moves the guest's read mark; the relay answers with the membership it moved.
        'chat.read': data => {
            const room = roomOf(data);
            const { chatNo = 0 } = (data ?? {}) as { chatNo?: number };
            return joinOf(room?.channel.id ?? SELF_CHANNEL.id, GUEST.uid, chatNo);
        },
        'chat.feed': data => feedPage(roomOf(data)?.chats ?? [], data),
    };
};

/** The page size the relay answers `chat.feed` with when the request names none — a room's first page. */
export const FEED_DEFAULT_LIMIT = 20;

/**
 * One `chat.feed` page as the relay pages a room: newest first, below `cursorNo` when the request
 * names one (exclusive), at most `limit` rows. Its `cursorNo` is where the next older page starts —
 * the oldest row it carries — and `0` once nothing older is left, which is the relay's "last page".
 */
export const feedPage = (chats: FixtureRoom['chats'], data: unknown) => {
    const { cursorNo, limit = FEED_DEFAULT_LIMIT } = (data ?? {}) as { cursorNo?: number; limit?: number };
    const newestFirst = [...chats].sort((a, b) => b.chatNo - a.chatNo);
    const below = cursorNo ? newestFirst.filter(chat => chat.chatNo < cursorNo) : newestFirst;
    const list = below.slice(0, limit);
    const oldest = list[list.length - 1]?.chatNo ?? 0;
    return {
        list,
        limit,
        cursorNo: below.length > list.length ? oldest : 0,
        readNo: newestFirst[0]?.chatNo ?? 0,
        total: chats.length,
    };
};

/**
 * The 1:1 with Mina with a long history: `count` messages, numbered from 1, each its own line of text
 * (`historyLine`) so a row on screen says which message it is.
 */
export const longDmRoom = (count: number): FixtureRoom => {
    const room = dmRoom();
    room.chats = Array.from({ length: count }, (_, index) =>
        chatView(DM_CHANNEL.id, index + 1, historyLine(index + 1))
    );
    room.channel.chatNo = count;
    return room;
};

/** The text of message `chatNo` in `longDmRoom`. */
export const historyLine = (chatNo: number): string => `History line ${chatNo}`;
