export type PushKind = 'room' | 'cloud-ready' | 'custom';

/** A room a push points at: its channel, its cloud (`#` on the relay) and its place. */
export interface PushRoom {
    channelId: string;
    cid: string;
    sid: string;
}

/**
 * What a room message carries beyond its room — the fields the web reads off a push (its in-app
 * banner and its routing read them through the `payload` merge): the channel name for the headline,
 * the sender (a push whose `ownerId` is the signed-in user is the user's own message echoed back,
 * and shows no banner), a thumbnail, and the message id that ties a receipt to its tap.
 */
export interface PushMessage {
    channelName?: string;
    ownerId?: string;
    thumbnail?: string;
    messageId?: string;
    /** Anything else, added to `payload` as typed. */
    extra?: ReadonlyArray<{ key: string; value: string }>;
    /**
     * In the shape FCM delivers it: `payload` as a JSON string and the message id beside it, as the
     * server's data message arrives on a device. Off, `payload` is an object — the web reads both.
     */
    asDelivered?: boolean;
}

export const PUSH_KINDS: readonly PushKind[] = ['room', 'cloud-ready', 'custom'];

const present = (value: string | undefined): value is string => typeof value === 'string' && value.trim() !== '';

/**
 * A room message about `room`, in the shape the server sends: `type`, the room's `link`, and a
 * `payload` with the cloud (`#` on the relay), the place and whatever `message` fills in.
 */
export const roomPushData = (room: PushRoom, message: PushMessage = {}): Record<string, unknown> => {
    const payload: Record<string, unknown> = { cid: room.cid || '#', sid: room.sid, channelId: room.channelId };
    if (present(message.channelName)) payload['channelName'] = message.channelName;
    if (present(message.ownerId)) payload['ownerId'] = message.ownerId;
    if (present(message.thumbnail)) payload['thumbnail'] = message.thumbnail;
    if (present(message.messageId)) payload['messageId'] = message.messageId;
    for (const { key, value } of message.extra ?? []) {
        if (present(key)) payload[key.trim()] = value;
    }
    const data: Record<string, unknown> = { type: 'chat', link: `/channels/${room.channelId}/room` };
    if (!message.asDelivered) return { ...data, payload };
    return {
        ...data,
        payload: JSON.stringify(payload),
        ...(present(message.messageId) ? { messageId: message.messageId } : {}),
    };
};

/** The `data` a kind makes. Throws on custom JSON that does not parse to an object, or a room with no channel. */
export const pushData = (
    kind: PushKind,
    input: { room: PushRoom; json: string; message?: PushMessage }
): Record<string, unknown> => {
    switch (kind) {
        case 'room':
            if (!input.room.channelId.trim()) throw new Error('no channel');
            return roomPushData(input.room, input.message);
        case 'cloud-ready':
            return { type: 'cloud' };
        case 'custom': {
            const parsed: unknown = JSON.parse(input.json);
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
            return parsed as Record<string, unknown>;
        }
    }
};

/** A message id like the server's, unique enough to tell two pushes apart in the log. */
export const newMessageId = (now: number = Date.now()): string => `virtual-${now.toString(36)}`;
