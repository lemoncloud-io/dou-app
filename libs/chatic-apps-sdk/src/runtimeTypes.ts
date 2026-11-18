/**
 * What `apps.runtime` reads, typed: every method the app's runtime opens to a page, under the name the
 * app gives it, with its arguments and what it answers. The rows are the app's own rows, field for
 * field — this library does not rename, reshape or filter them.
 *
 * Declared here rather than imported: the app's types live in private packages a published library
 * cannot point at. The app's contract tests hold each declaration to the app's real one, so a field the
 * app adds, drops or retypes fails there before a page meets it.
 *
 * About the fields:
 * - A field marked optional is there only when the server or the app filled it. Most of a row is
 *   optional, because the same row is filled from different answers over time; read each with a
 *   fallback.
 * - Some fields are contact or account details — an email, an account number, a login id. The app
 *   hands them over exactly as its own screens read them. Use them only where the page needs them, keep
 *   them on the device, and say so to the user if they leave it: what a page does with what it read is
 *   its author's responsibility.
 * - `meta` is whatever the server keeps beside a record, in no fixed shape.
 */

/** A server record's owner ids, as the server stamps them. */
export interface RuntimeCores {
    sid?: string;
    uid?: string;
    gid?: string;
}

/** When the device cache last filled a row and when it stops trusting it, in epoch ms. */
export interface RuntimeCacheMeta {
    lastSyncedAt: number;
    expiresAt: number;
}

/** A list read: its rows and the paging around them. */
export interface RuntimeList<Row> {
    list: Row[];
    meta: RuntimeListMeta;
}

export interface RuntimeListMeta {
    total: number;
    limit?: number;
    page?: number;
    cursorNo?: number;
    readNo?: number;
    /** Where the list came from: the device cache, the server, or the cache standing in for the server. */
    source?: 'local' | 'remote' | 'fallback';
}

// ---------------------------------------------------------------------------------------------------
// Views the server embeds inside a row (`owner$`, `lastChat$`, `$join`, ...). Every field is optional:
// the server embeds what it had at hand.
// ---------------------------------------------------------------------------------------------------

/** A user as the server embeds one in another record. */
export interface RuntimeUserView {
    id?: string;
    createdAt?: number;
    updatedAt?: number;
    deletedAt?: number;
    error?: string;
    $?: RuntimeCores;
    stereo?: '' | 'user' | 'admin' | 'dummy' | 'system';
    ns?: string;
    type?: 'profile' | 'user' | 'site';
    sid?: string;
    uid?: string;
    gid?: string;
    lock?: number;
    next?: number;
    meta?: unknown;
    _id?: string;
    name?: string;
    thumbnail?: string;
    nick?: string;
    /** Account detail: the user's sign-in id. */
    loginId?: string;
    /** Account detail: the user's identity id with the sign-in provider. */
    identityId?: string;
    channelIds?: string[];
    $join?: RuntimeJoinView;
}

/** A join (a user's membership of a room) as the server embeds one. */
export interface RuntimeJoinView {
    id?: string;
    createdAt?: number;
    updatedAt?: number;
    deletedAt?: number;
    error?: string;
    $?: RuntimeCores;
    stereo?: '' | 'admin' | 'owner' | 'member';
    chatNo?: number;
    metaNo?: number;
    channelId?: string;
    ns?: string;
    type?: 'channel' | 'chat' | 'join';
    sid?: string;
    uid?: string;
    gid?: string;
    lock?: number;
    next?: number;
    meta?: unknown;
    _id?: string;
    cid?: string;
    nick?: string;
    userId?: string;
    joinedNo?: number;
    role?: string;
    notify?: '' | 'all' | 'mention' | 'none';
    reason?: string;
    joined?: number;
}

/** A room as the server embeds one. */
export interface RuntimeChannelView {
    id?: string;
    createdAt?: number;
    updatedAt?: number;
    deletedAt?: number;
    error?: string;
    $?: RuntimeCores;
    stereo?: '' | 'public' | 'private' | 'dm' | 'self';
    chatNo?: number;
    metaNo?: number;
    memberNo?: number;
    ownerId?: string;
    ns?: string;
    type?: 'channel' | 'chat' | 'join';
    sid?: string;
    uid?: string;
    gid?: string;
    lock?: number;
    next?: number;
    meta?: unknown;
    _id?: string;
    cid?: string;
    name?: string;
    thumbnail?: string;
    desc?: string;
    inviteRule?: '' | 'owner' | 'all';
    memberIds?: string[];
    openFeed?: boolean;
    unreadCount?: number;
    owner$?: RuntimeUserView;
    lastChat$?: RuntimeChatView;
    $join?: RuntimeJoinView;
    $joins?: RuntimeJoinView[];
}

/** A message as the server embeds one. */
export interface RuntimeChatView {
    id?: string;
    createdAt?: number;
    updatedAt?: number;
    deletedAt?: number;
    error?: string;
    $?: RuntimeCores;
    stereo?: '' | 'user' | 'webhook' | 'system';
    subType?: '' | 'join' | 'leave' | 'reaction' | 'edit';
    contentType?: string;
    content?: string;
    chatNo?: number;
    metaNo?: number;
    readCount?: number;
    memberNo?: number;
    editedAt?: number;
    parentId?: string;
    channelId?: string;
    ownerId?: string;
    uploadIds?: string[];
    ns?: string;
    type?: 'channel' | 'chat' | 'join';
    sid?: string;
    uid?: string;
    gid?: string;
    lock?: number;
    next?: number;
    meta?: unknown;
    _id?: string;
    cid?: string;
    hidden?: boolean;
    mention$?: RuntimeChatMention;
    owner$?: RuntimeUserView;
    channel$?: RuntimeChannelView;
    parent$?: RuntimeChatView;
    upload$$?: RuntimeUpload[];
    reaction$?: RuntimeChatReaction;
    edit$?: RuntimeChatEdit;
    attach$?: RuntimeChatAttachment;
    blocks$?: RuntimeChatBlock[];
    source$?: RuntimeChatSource;
}

/** Who a message mentions. */
export interface RuntimeChatMention {
    userIds?: string[];
    all?: boolean;
}

/** On a `reaction` message: the reaction it records. */
export interface RuntimeChatReaction {
    action?: string;
    emoji?: string;
    chatId?: string;
}

/** On an `edit` message: the message it changed. */
export interface RuntimeChatEdit {
    action: 'update' | 'delete';
    chatId: string;
    hash?: string;
}

/** An attachment card, as a webhook posts one. */
export interface RuntimeChatAttachment {
    pretext?: string;
    title?: string;
    text?: string;
    color?: string;
    username?: string;
    ts?: number;
    footer?: string;
    sourceUrl?: string;
    fields?: { title?: string; value: string | number }[];
    channel?: string;
}

export interface RuntimeChatBlockText {
    type: 'mrkdwn' | 'plain_text';
    text: string;
}

/** One block of a message laid out in blocks, as a webhook posts one. */
export type RuntimeChatBlock =
    | { type: 'header'; text: RuntimeChatBlockText }
    | { type: 'section'; text?: RuntimeChatBlockText; fields?: RuntimeChatBlockText[] }
    | { type: 'divider' }
    | { type: 'context'; elements: RuntimeChatBlockText[] };

/** Where a webhook message came from. */
export interface RuntimeChatSource {
    key?: string;
    url?: string;
    color?: string;
}

/** A stored file's resource: its preview. */
export interface RuntimeUploadResource {
    url: string;
    contentType?: string;
    contentSize?: number;
    width?: number;
    height?: number;
    hash?: string;
}

/** A file a sent message carries. */
export interface RuntimeUpload {
    status: 'pending' | 'stored' | 'failed';
    id?: string;
    createdAt?: number;
    updatedAt?: number;
    deletedAt?: number;
    error?: string;
    $?: RuntimeCores;
    stereo?: 'image' | 'video' | 'audio' | 'file';
    contentType?: string;
    ns?: string;
    type?: 'upload';
    sid?: string;
    uid?: string;
    gid?: string;
    lock?: number;
    next?: number;
    meta?: unknown;
    _id?: string;
    contentSize?: number;
    width?: number;
    height?: number;
    hash?: string;
    name?: string;
    url?: string;
    thumbnail?: RuntimeUploadResource;
    orgUrl?: string;
    thumbUrl?: string;
}

/** A file of a message this device has not finished sending. */
export interface RuntimePendingUpload {
    localStatus: 'sending' | 'failed';
    /** An object URL of the app's own page: it does not open in another page. */
    localThumbUrl: string;
    localName?: string;
    localContentType?: string;
    localSize?: number;
}

/** What `chat.observeFeedCoverage` and others mean by a `[low, high]` range of message numbers. */
export type RuntimeChatNumberRange = readonly [low: number, high: number];

/** One entry of a message's media index: an attachment or a link it carries. */
export interface RuntimeChatMediaEntry {
    kind: 'image' | 'video' | 'file' | 'audio' | 'link';
    idx: number;
    /** An attachment's upload id, or a link's URL. */
    ref: string;
}

// ---------------------------------------------------------------------------------------------------
// The rows.
// ---------------------------------------------------------------------------------------------------

/** A room (`channel`), as the device cache holds it. */
export interface RuntimeChannel {
    id: string;
    /** The cloud the row belongs to. */
    cid: string;
    /** The place the room is in. */
    sid: string;
    isNotificationEnabled: boolean;
    createdAt?: number;
    updatedAt?: number;
    deletedAt?: number;
    error?: string;
    $?: RuntimeCores;
    /** `dm` a one-to-one room, `self` the user's own notes room. */
    stereo?: '' | 'public' | 'private' | 'dm' | 'self';
    name?: string;
    desc?: string;
    inviteRule?: '' | 'owner' | 'all';
    thumbnail?: string;
    memberNo?: number;
    memberIds?: string[];
    /** The room's latest message number. */
    chatNo?: number;
    /** How many of its numbers are not people's messages (joins, edits, reactions). */
    metaNo?: number;
    ownerId?: string;
    ns?: string;
    type?: 'channel' | 'chat' | 'join';
    uid?: string;
    gid?: string;
    lock?: number;
    next?: number;
    meta?: unknown;
    _id?: string;
    openFeed?: boolean;
    unreadCount?: number;
    owner$?: RuntimeUserView;
    lastChat$?: RuntimeChatView;
    /** The user's own join of the room. */
    $join?: RuntimeJoinView;
    $joins?: RuntimeJoinView[];
    /** Not filled by anything today. */
    lastActivityAt?: number;
    __cacheMeta?: RuntimeCacheMeta;
}

/** A user's membership of a room (`join`): their role, read position and notification setting. */
export interface RuntimeJoin {
    id: string;
    cid: string;
    channelId: string;
    userId: string;
    joined: number;
    /** The last message number this member has read. */
    readNo: number;
    createdAt?: number;
    updatedAt?: number;
    deletedAt?: number;
    error?: string;
    $?: RuntimeCores;
    stereo?: '' | 'owner' | 'admin' | 'member';
    chatNo?: number;
    metaNo?: number;
    ns?: string;
    type?: 'channel' | 'chat' | 'join';
    sid?: string;
    uid?: string;
    gid?: string;
    lock?: number;
    next?: number;
    meta?: unknown;
    _id?: string;
    joinedNo?: number;
    nick?: string;
    role?: string;
    notify?: '' | 'all' | 'mention' | 'none';
    reason?: string;
    __cacheMeta?: RuntimeCacheMeta;
}

/** A message (`chat`), as the device cache holds it. */
export interface RuntimeChat {
    id: string;
    cid: string;
    channelId: string;
    /** Its number in the room; `0` while it is still being sent. */
    chatNo: number;
    /** Still on its way to the server. */
    isPending: boolean;
    /** Its send failed on this device. */
    isFailed: boolean;
    createdAtMs: number;
    updatedAtMs: number;
    createdAt?: number;
    updatedAt?: number;
    deletedAt?: number;
    error?: string;
    $?: RuntimeCores;
    stereo?: '' | 'user' | 'system' | 'webhook';
    subType?: '' | 'join' | 'leave' | 'reaction' | 'edit';
    contentType?: string;
    content?: string;
    memberNo?: number;
    metaNo?: number;
    ownerId?: string;
    readCount?: number;
    editedAt?: number;
    parentId?: string;
    hidden?: boolean;
    uploadIds?: string[];
    ns?: string;
    type?: 'channel' | 'chat' | 'join';
    sid?: string;
    uid?: string;
    gid?: string;
    lock?: number;
    next?: number;
    meta?: unknown;
    _id?: string;
    owner$?: RuntimeUserView;
    channel$?: RuntimeChannelView;
    parent$?: RuntimeChatView;
    mention$?: RuntimeChatMention;
    reaction$?: RuntimeChatReaction;
    edit$?: RuntimeChatEdit;
    attach$?: RuntimeChatAttachment;
    blocks$?: RuntimeChatBlock[];
    source$?: RuntimeChatSource;
    /** The server's files once sent; this device's pending slots while it is still sending. */
    upload$$?: (RuntimeUpload | RuntimePendingUpload)[];
    tempId?: string;
    /** Hidden by this device because a page of the feed left it out, not by a delete. */
    hiddenByFeed?: boolean;
    mediaEntries?: RuntimeChatMediaEntry[];
    mediaEntriesVersion?: number;
    __cacheMeta?: RuntimeCacheMeta;
}

/** One room's latest message, as the room list shows it. */
export interface RuntimeLastChat {
    channelId: string;
    /** The highest message number cached for the room. */
    lastNo: number;
    /** The latest message a room list previews; `null` when none. */
    chat: RuntimeChat | null;
    /** The latest message that counts as activity, thread replies included; `null` when none. */
    activity: RuntimeChat | null;
}

/** A place (`site`) of the current cloud. */
export interface RuntimePlace {
    id: string;
    cid: string;
    /** Its position in the user's list. */
    order: number;
    ownerId?: string;
    thumbnail?: string;
    desc?: string;
    isOwner?: boolean;
    /** Service detail: the place's server endpoints. */
    $envs?: RuntimeServiceEndpoints;
    legacy?: boolean;
    isPublic?: boolean;
    /** The place's owner, as the account server has them: much of it is contact and account detail. */
    owner$?: RuntimeAccountUserView;
    createdAt?: number;
    updatedAt?: number;
    deletedAt?: number;
    error?: string;
    $?: RuntimeCores;
    stereo?: '' | '#alias' | 'mine' | 'place' | 'work' | 'domain' | 'session';
    name?: string;
    ns?: string;
    type?: 'user' | 'role' | 'host' | 'site' | 'account' | 'group' | 'auth' | 'invite';
    sid?: string;
    uid?: string;
    gid?: string;
    lock?: number;
    next?: number;
    meta?: unknown;
    _id?: string;
    aliasId?: string;
    alias$?: RuntimeAlias;
    domain?: string;
    host?: string;
    alias?: string;
    base?: string;
    code?: string;
    linked?: number;
    typeCode?: string;
    __cacheMeta?: RuntimeCacheMeta;
}

/**
 * A user as the account server embeds one (a place's `owner$`) — not the chat server's user. Most of it
 * is contact and account detail. The type lists every field the account server's view can have; which
 * of them a given answer fills is the server's choice, and the app passes on what it got. Fields named
 * after a secret (`loginPw`, `otp$`, `key$`) are not something a page should ever read, keep or send.
 */
export interface RuntimeAccountUserView {
    id: string;
    createdAt?: number;
    updatedAt?: number;
    deletedAt?: number;
    error?: string;
    $?: RuntimeCores;
    role?: string;
    stereo?: '' | '#alias' | 'session' | 'user' | '#code' | 'admin' | 'dummy';
    alias$?: RuntimeAlias;
    name?: string;
    aliasId?: string;
    alias?: string;
    code?: string;
    ns?: string;
    type?: 'host' | 'site' | 'account' | 'user' | 'group' | 'role' | 'auth' | 'invite';
    sid?: string;
    uid?: string;
    gid?: string;
    lock?: number;
    next?: number;
    meta?: unknown;
    _id?: string;
    nick?: string;
    photo?: string;
    /** Contact detail. */
    phone?: string;
    text?: string;
    /** Personal detail. */
    gender?: '' | 'male' | 'female';
    /** Personal detail. */
    birth?: string;
    /** Contact detail. */
    address?: RuntimeAddress;
    /** Contact detail. */
    email?: string;
    aliasType?: string;
    siteId?: string;
    site$?: { id?: string; name?: string };
    loginType?: string;
    /** Account detail: the sign-in id. */
    loginId?: string;
    /** Named after a secret. Never read, keep or send it. */
    loginPw?: string;
    identityId?: string;
    lastAuthId?: string;
    /** When the user agreed to each term, in epoch ms, by the term's name: `service`, `privacy`, `privacy3rd`, … */
    agree$?: { [term: string]: number };
    parent?: string;
    childs?: string[];
    otpSentCount?: number;
    otpSentDay?: string;
    inviteNo?: number;
    accountId?: string;
    roles?: string[];
    /** Account detail. */
    $account?: RuntimeAccountView;
    /** Account detail: the sign-in methods linked to the account. */
    link$?: { phone?: RuntimeLinkedAccount; email?: RuntimeLinkedAccount; social?: RuntimeLinkedAccount };
}

export interface RuntimeAddress {
    addrPost?: string;
    addrStreet?: string;
    addrDetail?: string;
    addrExtra?: string;
}

export interface RuntimeLinkedAccount {
    hint?: string;
    provider?: string;
    linkedAt?: number;
}

/** An account as the account server has it. Contact and account detail throughout. */
export interface RuntimeAccountView {
    id?: string;
    isPushNotice?: boolean;
    isPushCommunity?: boolean;
    isPushMarketing?: boolean;
    createdAt?: number;
    updatedAt?: number;
    deletedAt?: number;
    error?: string;
    $?: RuntimeCores;
    group?: string;
    stereo?:
        | ''
        | '#alias'
        | 'session'
        | 'code'
        | 'phone'
        | 'email'
        | 'business'
        | 'device'
        | 'hash'
        | 'iid'
        | 'login'
        | 'social';
    name?: string;
    aliasId?: string;
    ns?: string;
    type?: 'host' | 'site' | 'account' | 'user' | 'group' | 'role' | 'auth' | 'invite';
    sid?: string;
    uid?: string;
    gid?: string;
    lock?: number;
    next?: number;
    meta?: unknown;
    _id?: string;
    nick?: string;
    photo?: string;
    phone?: string;
    email?: string;
    identityId?: string;
    otpSentCount?: number;
    otpSentDay?: string;
    accountId?: string;
    kind?: string;
    hint?: string;
    verifiedAt?: number;
    /** Named after a secret (a one-time code). Never read, keep or send it. */
    otp$?: { code?: string; expiredAt?: number; hash?: string; sentAt?: number };
    otpTryCount?: number;
    openId?: string;
    /** Named after a secret (an account key). Never read, keep or send it. */
    key$?: { _id: string; key: string; len: string; prefix: string; alias?: string };
    userId?: string;
    identityPoolId?: string;
    accountNo?: string;
}

/** A user of the current cloud. */
export interface RuntimeUser {
    id: string;
    cid: string;
    createdAt?: number;
    updatedAt?: number;
    deletedAt?: number;
    error?: string;
    $?: RuntimeCores;
    stereo?: '' | 'user' | 'system' | 'admin' | 'dummy';
    name?: string;
    thumbnail?: string;
    nick?: string;
    ns?: string;
    type?: 'user' | 'site' | 'profile';
    sid?: string;
    uid?: string;
    gid?: string;
    lock?: number;
    next?: number;
    meta?: unknown;
    _id?: string;
    /** Account detail: the user's sign-in id. */
    loginId?: string;
    /** Account detail: the user's identity id with the sign-in provider. */
    identityId?: string;
    channelIds?: string[];
    $join?: RuntimeJoinView;
    __cacheMeta?: RuntimeCacheMeta;
}

/** A user's profile in one place: the name and picture they show there. */
export interface RuntimeProfile {
    /** `<place id>@<user id>`. */
    id: string;
    cid: string;
    /** The place. */
    sid: string;
    uid: string;
    userId: string;
    updatedAtMs: number;
    active?: boolean;
    createdAt?: number;
    updatedAt?: number;
    deletedAt?: number;
    error?: string;
    $?: RuntimeCores;
    stereo?: string;
    thumbnail?: string;
    nick?: string;
    siteId?: string;
    ns?: string;
    type?: 'user' | 'site' | 'profile';
    gid?: string;
    lock?: number;
    next?: number;
    meta?: unknown;
    _id?: string;
    __cacheMeta?: RuntimeCacheMeta;
}

/** A member of one place, as `user.listPlaceMembers` lists them. */
export interface RuntimePlaceMember {
    id: string;
    cid: string;
    name?: string;
    nick?: string;
    thumbnail?: string;
    /** Owns this place. */
    isOwner?: boolean;
}

/** What `user.listPlaceMembers` answers. */
export interface RuntimePlaceMembers {
    members: RuntimePlaceMember[];
    /** The cloud and place the list is of. */
    context: { cid: string; sid: string };
    /** Whether the members' place profiles were loaded into the device cache along the way. */
    profiles: 'loaded' | 'skipped' | 'failed';
}

/** The current cloud's row. Much of it is account and billing detail: read only what the page needs. */
export interface RuntimeCloud {
    id: string;
    cid: string;
    name?: string;
    /** Service detail: the cloud's server address. */
    backend?: string;
    /** Service detail: the cloud's socket address. */
    wss?: string;
    /** `owner` a cloud the user owns, `invited` one they joined. */
    cloudType?: 'invited' | 'owner';
    /** Account detail: the device user ids that accepted an invite into this cloud. */
    acceptedBy?: string[];
    /** Service detail: the cloud's server endpoints. */
    $envs?: RuntimeServiceEndpoints;
    createdAt?: number;
    updatedAt?: number;
    deletedAt?: number;
    error?: string;
    $?: RuntimeCores;
    owner$?: { id?: string; name?: string };
    stereo?: '' | '#alias' | '#root';
    ownerId?: string;
    ns?: string;
    type?: 'cloud' | 'membership' | 'product';
    sid?: string;
    uid?: string;
    gid?: string;
    lock?: number;
    next?: number;
    meta?: unknown;
    _id?: string;
    /** Contact detail: the cloud's email address. */
    email?: string;
    /** Account detail. */
    accountId?: string;
    /** Account detail. */
    account$?: RuntimeAccountHead;
    aliasId?: string;
    alias$?: RuntimeAlias;
    /** Billing detail. */
    subscriptionId?: string;
    status?: 'error' | 'init' | 'reserved' | 'active' | 'suspended' | 'expired';
    expiresAt?: number;
    assignedAt?: number;
    activedAt?: number;
    /** Account detail: the cloud's account number. */
    accountNo?: string;
    region?: string;
    stage?: string;
    cloudNo?: number;
    state$?: RuntimeCloudState;
    suspendedAt?: number;
    plannedAt?: number;
    suspendReason?: 'expired' | 'downgrade' | 'cancel' | 'release';
    retainUntil?: number;
    releasedAt?: number;
    enqueueId?: string;
    workspaceId?: string;
    slotId?: string;
    __cacheMeta?: RuntimeCacheMeta;
}

export interface RuntimeServiceEndpoints {
    accountNo?: string;
    backend?: string;
    wss?: string;
}

export interface RuntimeAccountHead {
    id?: string;
    name?: string;
    stereo?:
        | ''
        | 'hash'
        | 'email'
        | 'business'
        | 'code'
        | 'device'
        | '#alias'
        | 'iid'
        | 'login'
        | 'phone'
        | 'social'
        | 'session';
    openId?: string;
}

export interface RuntimeAlias {
    type?: string;
    alias?: string;
}

export interface RuntimeCloudState {
    provision?: 'init' | 'reserved' | 'active';
    hold?: '' | 'downgrade' | 'expired';
    life?: '' | 'released';
    plan?: '' | 'drop';
}

/**
 * The session as a page with the `session` permission gets it: the current cloud's half and who the
 * user is in it. Nothing of the user's other clouds, and no server address or token.
 */
export interface RuntimeSession {
    context: {
        cloud: {
            cloudId: string | null;
            /** The place selected; it moves before a switch is done. */
            siteId: string | null;
            isActive: boolean;
        };
        identity: {
            /** The user's id in this cloud. */
            userId: string | null;
            isAuthenticated: boolean;
        };
    };
    /** The place the session is really on. */
    committedSiteId: string | null;
}

// ---------------------------------------------------------------------------------------------------
// Arguments.
// ---------------------------------------------------------------------------------------------------

/** Which rooms: the place's (`sid`), one page of them. */
export interface RuntimeChannelListQuery {
    sid?: string;
    page?: number;
    limit?: number;
    detail?: boolean;
    hasSite?: boolean;
}

/** Which joins: one room's, or only active ones. */
export interface RuntimeJoinListQuery {
    channelId?: string;
    activeOnly?: boolean;
}

/** One room's messages, `limit` of them below `cursorNo` (from the newest when absent). */
export interface RuntimeChatFeedQuery {
    channelId: string;
    cursorNo?: number;
    limit?: number;
}

/** `RuntimeChatFeedQuery`, and whether messages still being sent are listed too. */
export interface RuntimeChatObserveQuery extends RuntimeChatFeedQuery {
    includeUnsent?: boolean;
}

/** One room's members. */
export interface RuntimeUserListQuery {
    channelId: string;
    limit?: number;
    page?: number;
    detail?: boolean;
}

/** Whose profiles: a place's, a user's, or one user's in one place. `siteId`/`userId` are older names. */
export interface RuntimeProfileListQuery {
    sid?: string;
    uid?: string;
    siteId?: string;
    userId?: string;
}

/**
 * The places list takes no filter: pass `{}`. Always pass it — the app takes the stream's listener from
 * the argument after it.
 */
export type RuntimePlaceListQuery = Record<string, never>;

/** The current place's members. Both ids must be the place the session is on. */
export interface RuntimePlaceMembersQuery {
    placeId: string;
    sessionPlaceId: string;
}

/** A plain text message to a room of the place the view opened on. */
export interface RuntimeSendChatInput {
    channelId: string;
    /** Something besides white space, at most 1000 UTF-16 code units. */
    content: string;
}

// ---------------------------------------------------------------------------------------------------
// The map.
// ---------------------------------------------------------------------------------------------------

/** The manifest permissions that open runtime methods. */
export type RuntimePermission = 'session' | 'cloud' | 'place' | 'channel' | 'chat' | 'user' | 'chatSend';

/**
 * Every method `apps.runtime.call` reaches, by the app's own `<repository>.<method>` name: the
 * permission that opens it, its arguments and what it resolves with. `can(method)` still says whether it
 * is open now — this says only what it would be.
 */
export interface RuntimeCalls {
    'channel.cacheRead': { permission: 'channel'; args: [id: string]; result: RuntimeChannel | null };
    'channel.cacheReadList': {
        permission: 'channel';
        args: [query: RuntimeChannelListQuery];
        result: RuntimeList<RuntimeChannel> | null;
    };
    /** Asks the server; counts against the view's server reads. */
    'channel.fetchList': {
        permission: 'channel';
        args: [query: RuntimeChannelListQuery];
        result: RuntimeList<RuntimeChannel>;
    };
    'join.cacheReadList': {
        permission: 'channel';
        args: [query: RuntimeJoinListQuery];
        result: RuntimeList<RuntimeJoin> | null;
    };
    'chat.cacheRead': { permission: 'chat'; args: [id: string]; result: RuntimeChat | null };
    'chat.cacheReadList': {
        permission: 'chat';
        args: [query: RuntimeChatFeedQuery];
        result: RuntimeList<RuntimeChat> | null;
    };
    'chat.listPendingImageChats': { permission: 'chat'; args: [channelId: string]; result: RuntimeChat[] };
    /** The one write. `apps.runtime.sendMessage` calls it; prefer that. */
    'chat.sendChat': { permission: 'chatSend'; args: [input: RuntimeSendChatInput]; result: RuntimeChat };
    /** `id` must be the current cloud's. */
    'cloud.cacheRead': { permission: 'cloud'; args: [id: string]; result: RuntimeCloud | null };
    /** Asks the server. `id` must be the current cloud's, and `cache: false` is required. */
    'cloud.getCloud': {
        permission: 'cloud';
        args: [input: { id: string }, options: { cache: false }];
        result: RuntimeCloud;
    };
    'place.cacheReadList': {
        permission: 'place';
        args: [query?: RuntimePlaceListQuery];
        result: RuntimeList<RuntimePlace> | null;
    };
    /** Asks the server. */
    'place.isPlaceDeleted': { permission: 'place'; args: [id: string]; result: boolean };
    'user.cacheRead': { permission: 'user'; args: [id: string]; result: RuntimeUser | null };
    'user.cacheReadList': {
        permission: 'user';
        args: [query: RuntimeUserListQuery];
        result: RuntimeList<RuntimeUser> | null;
    };
    /** Asks the server, for the place the session is on only. */
    'user.listPlaceMembers': {
        permission: 'user';
        args: [query: RuntimePlaceMembersQuery];
        result: RuntimePlaceMembers;
    };
    'profile.cacheRead': { permission: 'user'; args: [id: string]; result: RuntimeProfile | null };
    'profile.cacheReadList': {
        permission: 'user';
        args: [query?: RuntimeProfileListQuery];
        result: RuntimeList<RuntimeProfile> | null;
    };
}

/**
 * Every stream `apps.runtime.subscribe` reaches: the permission that opens it, the arguments the page
 * passes, and what each event carries. The app's method takes its listener right after these arguments,
 * which is where `subscribe` puts it — so a typed call needs no `LISTENER`.
 */
export interface RuntimeStreams {
    'channel.observeList': {
        permission: 'channel';
        args: [query: RuntimeChannelListQuery];
        event: [result: RuntimeList<RuntimeChannel> | null];
    };
    'channel.observeItem': { permission: 'channel'; args: [id: string]; event: [item: RuntimeChannel | null] };
    'join.observeList': {
        permission: 'channel';
        args: [query: RuntimeJoinListQuery];
        event: [result: RuntimeList<RuntimeJoin> | null];
    };
    'chat.observeList': {
        permission: 'chat';
        args: [query: RuntimeChatObserveQuery];
        event: [result: RuntimeList<RuntimeChat> | null];
    };
    'chat.observeLastList': {
        permission: 'chat';
        args: [channelIds: string[]];
        event: [result: RuntimeLastChat[]];
    };
    /** The message-number ranges a feed read has answered for; a gap inside one is a deleted message. */
    'chat.observeFeedCoverage': {
        permission: 'chat';
        args: [channelId: string];
        event: [covered: RuntimeChatNumberRange[]];
    };
    /** `id` must be the current cloud's. */
    'cloud.observeItem': { permission: 'cloud'; args: [id: string]; event: [item: RuntimeCloud | null] };
    'place.observeList': {
        permission: 'place';
        args: [query: RuntimePlaceListQuery];
        event: [result: RuntimeList<RuntimePlace> | null];
    };
    'place.observeItem': { permission: 'place'; args: [id: string]; event: [item: RuntimePlace | null] };
    'user.observeList': {
        permission: 'user';
        args: [query: RuntimeUserListQuery];
        event: [result: RuntimeList<RuntimeUser> | null];
    };
    'user.observeItem': { permission: 'user'; args: [id: string]; event: [item: RuntimeUser | null] };
    'profile.observeList': {
        permission: 'user';
        args: [query: RuntimeProfileListQuery];
        event: [result: RuntimeList<RuntimeProfile> | null];
    };
    'profile.observeItem': { permission: 'user'; args: [id: string]; event: [item: RuntimeProfile | null] };
}

export type RuntimeCallName = keyof RuntimeCalls;
export type RuntimeStreamName = keyof RuntimeStreams;
export type RuntimeCallArgs<M extends RuntimeCallName> = RuntimeCalls[M]['args'];
export type RuntimeCallResult<M extends RuntimeCallName> = RuntimeCalls[M]['result'];
export type RuntimeStreamArgs<M extends RuntimeStreamName> = RuntimeStreams[M]['args'];
export type RuntimeStreamEvent<M extends RuntimeStreamName> = RuntimeStreams[M]['event'];
