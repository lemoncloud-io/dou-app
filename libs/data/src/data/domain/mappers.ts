import type { CloudView, MySiteView } from '@lemoncloud/chatic-backend-api';
import type {
    ChannelView,
    ChatView,
    JoinView,
    ProfileDisplay,
    ProfileView,
    UserView,
} from '@lemoncloud/chatic-socials-api';
import type { DataContext } from '../repositories-v2/types';
import type {
    DomainChannel,
    DomainChat,
    DomainCloud,
    DomainJoin,
    DomainPlace,
    DomainProfile,
    DomainUser,
} from './models';

/**
 * Mapper input contract: a raw API view that MAY already carry persisted
 * domain-only fields (e.g. re-read cache rows or enriched responses).
 * Required API fields stay required; domain extras are optional reads.
 */
type ApiInput<TView, TDomain> = TView & Partial<TDomain>;

const toEpochMs = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = new Date(value).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

const toStringSafe = (value: unknown): string => {
    return typeof value === 'string' ? value : '';
};

const toNumberSafe = (value: unknown, fallback = 0): number => {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const toBooleanSafe = (value: unknown, fallback = false): boolean => {
    return typeof value === 'boolean' ? value : fallback;
};

const parseProfileId = (value: unknown): { sid: string; uid: string } => {
    const raw = toStringSafe(value);
    if (!raw) return { sid: '', uid: '' };
    const separator = raw.includes('@') ? '@' : raw.includes(':') ? ':' : '';
    if (!separator) return { sid: '', uid: '' };
    const [sid, uid] = raw.split(separator, 2);
    return {
        sid: toStringSafe(sid),
        uid: toStringSafe(uid),
    };
};

const normalizeJoinId = (id: unknown, channelId: unknown, userId: unknown): string => {
    const rawId = toStringSafe(id);
    if (rawId.includes('@')) return rawId;
    const normalizedChannelId = toStringSafe(channelId);
    const normalizedUserId = toStringSafe(userId);
    if (normalizedChannelId && normalizedUserId && rawId === `${normalizedChannelId}:${normalizedUserId}`) {
        return `${normalizedChannelId}@${normalizedUserId}`;
    }
    return rawId;
};

// Each mapper performs a single, one-way "API View -> Domain" conversion.
// They are the only place API shapes become domain shapes; repositories and
// local data sources consume the resulting domain models without re-mapping.

/**
 * API View -> DomainChannel.
 *
 * The view's `lastChat$` is deliberately NOT read here. The last message — and therefore its time —
 * is owned by the chat cache (`chat.observeLastList`, ADR-0057), so folding a server-side summary
 * into the channel model would give one channel two disagreeing answers for "when did this last move".
 * Ordering by the last chat's time is done from that cache instead; see `sortChannels`.
 */
export const toDomainChannel = (api: ApiInput<ChannelView, DomainChannel>, context: DataContext): DomainChannel => {
    const cid = context.cid || 'default';

    return {
        ...api,
        id: toStringSafe(api.id),
        cid,
        // Channel view sid: top-level field first, then the nested `$.sid`, then context.
        // Mirrors ChannelLocalDataSourceV2's precedence so a view's own site wins over context.
        sid: api.sid || api.$?.sid || context.sid || '',
        isNotificationEnabled: toBooleanSafe(api.isNotificationEnabled, true),
    };
};

/** API View -> DomainChat. Normalizes send-state flags and millisecond timestamps. */
export const toDomainChat = (api: ApiInput<ChatView, DomainChat>, context: DataContext): DomainChat => {
    const createdAtMs = toEpochMs(api.createdAt);
    const updatedAtMs = toEpochMs(api.updatedAt);
    const cid = context.cid || 'default';

    return {
        ...api,
        id: toStringSafe(api.id),
        tempId: api.tempId || undefined,
        cid,
        channelId: toStringSafe(api.channelId),
        chatNo: toNumberSafe(api.chatNo, 0),
        isPending: toBooleanSafe(api.isPending, false),
        isFailed: toBooleanSafe(api.isFailed, false),
        createdAtMs,
        updatedAtMs,
    };
};

/** API View -> DomainJoin. */
export const toDomainJoin = (api: ApiInput<JoinView, DomainJoin>, context: DataContext): DomainJoin => {
    const cid = context.cid || 'default';
    const channelId = toStringSafe(api.channelId);
    const userId = toStringSafe(api.userId);

    return {
        ...api,
        id: normalizeJoinId(api.id, channelId, userId),
        cid,
        channelId,
        userId,
        joined: toNumberSafe(api.joined, 1),
        // The server join's read cursor is `chatNo` — JoinView never carries a
        // `readNo` field, so without the fallback every server-mapped join
        // reported readNo 0 and only the raw chatNo passthrough was usable.
        readNo: toNumberSafe(api.readNo ?? api.chatNo, 0),
    };
};

/**
 * Channel user views (listUser / sync-users) embed the member's read-state in `$join`.
 * Extract it into a DomainJoin, backfilling channelId/userId/id from the request and the
 * parent user when the embedded view omits them. Returns null when there is no `$join`.
 */
export const toDomainJoinFromUser = (
    user: { id?: string; $join?: JoinView },
    context: DataContext,
    channelId?: string
): DomainJoin | null => {
    const join = user.$join;
    if (!join) return null;
    const joinChannelId = join.channelId || channelId;
    const joinUserId = join.userId || user.id;
    return toDomainJoin(
        {
            ...join,
            channelId: joinChannelId,
            userId: joinUserId,
            id: join.id || (joinChannelId && joinUserId ? `${joinChannelId}@${joinUserId}` : undefined),
        } as JoinView,
        context
    );
};

/**
 * API View -> DomainUser. Collects channel ids from the user's own `channelId`
 * and an optional embedded `$join`, neither of which is part of the typed UserView.
 */
export const toDomainUser = (
    api: ApiInput<UserView, DomainUser> & { channelId?: string; $join?: { channelId?: string } },
    context: DataContext
): DomainUser => {
    const channelId = toStringSafe(api.channelId);
    const joinedChannelId = toStringSafe(api.$join?.channelId);
    const channelIds = [channelId, joinedChannelId].filter(Boolean);
    const cid = context.cid || 'default';

    return {
        ...api,
        id: toStringSafe(api.id),
        cid,
        channelIds: Array.from(new Set(channelIds)),
    };
};

/** API View -> DomainPlace. Normalizes the place `type` and keeps a stable sort `order`. */
export const toDomainPlace = (api: ApiInput<MySiteView, DomainPlace>, context: DataContext): DomainPlace => {
    const rawType = api.type;
    const normalizedType = rawType === 'site' || rawType === 'user' ? rawType : undefined;
    const cid = context.cid || 'default';

    return {
        ...api,
        id: toStringSafe(api.id),
        cid,
        order: toNumberSafe(api.order, Number.MAX_SAFE_INTEGER),
        type: normalizedType,
        stereo: api.stereo === '' ? '' : undefined,
    };
};

/**
 * API View -> DomainProfile. Resolves the `sid:uid` identity from API aliases
 * (siteId/userId) or the active context, then derives the cache id.
 */
export const toDomainProfile = (
    api: ApiInput<ProfileView, DomainProfile> & Partial<ProfileDisplay>,
    context: DataContext
): DomainProfile => {
    const parsedId = parseProfileId(api.id);
    const sid = toStringSafe(api.siteId || api.sid) || parsedId.sid || context.sid || '';
    const uid = toStringSafe(api.uid || api.userId) || parsedId.uid || context.uid || '';
    const updatedAtMs = toEpochMs(api.updatedAt);
    const id = sid && uid ? `${sid}@${uid}` : toStringSafe(api.id);
    const cid = context.cid || 'default';

    return {
        ...api,
        id,
        cid,
        sid,
        uid,
        userId: toStringSafe(api.userId) || uid,
        updatedAtMs,
    };
};

/** API View -> DomainCloud. Classifies the cloud via `cloudType` ('invited' | 'owner'). */
export const toDomainCloud = (api: ApiInput<CloudView, DomainCloud>, context: DataContext): DomainCloud => {
    const cid = context.cid || 'default';

    return {
        ...api,
        id: toStringSafe(api.id),
        cid,
        name: toStringSafe(api.name) || undefined,
        backend: toStringSafe(api.backend) || undefined,
        wss: toStringSafe(api.wss) || undefined,
        cloudType: api.cloudType === 'invited' || api.cloudType === 'owner' ? api.cloudType : undefined,
    };
};
