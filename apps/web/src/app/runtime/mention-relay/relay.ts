/** The local development relay consumes cache records, never display-name guesses. */
export interface RelayChat {
    id?: unknown;
    cid?: unknown;
    channelId?: unknown;
    chatNo?: unknown;
    parentId?: unknown;
    ownerId?: unknown;
    content?: unknown;
    mention$?: unknown;
    createdAtMs?: unknown;
    isPending?: unknown;
    isFailed?: unknown;
    hidden?: unknown;
    stereo?: unknown;
}

export interface RelayScope {
    cloudId: string;
    channelId: string;
    channelName: string;
    viewerIds: string[];
}

export interface RelayJoin {
    cid?: unknown;
    channelId?: unknown;
    userId?: unknown;
    joined?: unknown;
    joinedNo?: unknown;
}

export interface RelayMembership {
    joinedNo: number;
}

export interface RelaySnapshot extends RelayScope {
    roomUserId: string;
    membership: RelayMembership | null;
    ready: boolean;
    rows: readonly RelayChat[];
}

export interface RelayConfig {
    enabled: boolean;
    channelName?: string;
    includeSelf?: boolean;
    token?: string;
    scope?: RelayScope | null;
    baselineChatNo?: number | null;
}

export interface RelayEvent {
    version: 1;
    cloudId: string;
    channelId: string;
    messageId: string;
    chatNo: number;
    parentId: string | null;
    senderId: string;
    content: string;
    mentionUserIds: string[];
    mentionAll?: boolean;
    createdAt?: number;
}

export interface RelayReceipt {
    accepted: boolean;
    reason?: string;
    status?: 'queue-submitted' | 'queue-uncertain';
    baselineChatNo?: number;
}

export interface RelayPorts {
    config: () => Promise<RelayConfig>;
    register: (token: string, scope: RelayScope, baselineChatNo: number) => Promise<RelayReceipt>;
    event: (token: string, event: RelayEvent, canSend: () => boolean) => Promise<RelayReceipt>;
    observe: (scope: RelayScope, receive: (rows: readonly RelayChat[]) => void) => () => void;
    observeMembership: (
        scope: RelayScope,
        roomUserId: string,
        receive: (membership: RelayMembership | null) => void
    ) => () => void;
    isCurrentUser: (cloudId: string, roomUserId: string) => boolean;
    status: (message: string) => void;
    armed?: (scope: RelayScope | null) => void;
}

export const isPublicRelayRoom = (
    channel: { id?: string; name?: string } | null | undefined,
    isGroupChat: boolean,
    channelId: string | undefined
): boolean => isGroupChat && !!channelId && channel?.id === channelId && channel.name === 'public';

/** Missing or inactive joins cannot authorize exporting retained local history. */
export const relayMembershipOf = (
    joins: readonly RelayJoin[] | null | undefined,
    scope: Pick<RelayScope, 'cloudId' | 'channelId'>,
    roomUserId: string
): RelayMembership | null => {
    const join = joins?.find(
        row => row.cid === scope.cloudId && row.channelId === scope.channelId && row.userId === roomUserId
    );
    return join?.joined === 1 && Number.isSafeInteger(join.joinedNo) && (join.joinedNo as number) >= 0
        ? { joinedNo: join.joinedNo as number }
        : null;
};

const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
export const viewerIdsOf = (ids: readonly (string | null | undefined)[]): string[] =>
    [...new Set(ids.filter(nonempty))].sort();

export const persistedChatNo = (row: RelayChat, scope: Pick<RelayScope, 'cloudId' | 'channelId'>): number =>
    row.cid === scope.cloudId &&
    row.channelId === scope.channelId &&
    nonempty(row.id) &&
    Number.isSafeInteger(row.chatNo) &&
    (row.chatNo as number) > 0 &&
    !row.isPending &&
    !row.isFailed
        ? (row.chatNo as number)
        : 0;

export const highestPersistedChatNo = (
    rows: readonly RelayChat[],
    scope: Pick<RelayScope, 'cloudId' | 'channelId'>
): number => rows.reduce((highest, row) => Math.max(highest, persistedChatNo(row, scope)), 0);

const matchesScope = (left: RelayScope, right: RelayScope): boolean =>
    left.cloudId === right.cloudId &&
    left.channelId === right.channelId &&
    left.channelName === right.channelName &&
    JSON.stringify(viewerIdsOf(left.viewerIds)) === JSON.stringify(viewerIdsOf(right.viewerIds));

/** Preserve the cache encoding; a bad parent must never become a channel-level reply target. */
const relayParentId = (parentId: unknown, channelId: string, chatNo: number): string | null | undefined => {
    if (parentId === undefined || parentId === null || parentId === '') return null;
    if (typeof parentId !== 'string') return undefined;
    const root = parentId.startsWith(`${channelId}:`) ? parentId.slice(channelId.length + 1) : parentId;
    if (!/^[1-9][0-9]*$/.test(root)) return undefined;
    const rootNo = Number(root);
    return Number.isSafeInteger(rootNo) && rootNo < chatNo ? parentId : undefined;
};

export const mentionEventOf = (row: RelayChat, scope: RelayScope, includeSelf: boolean): RelayEvent | null => {
    const chatNo = persistedChatNo(row, scope);
    if (
        !chatNo ||
        row.hidden ||
        row.stereo === 'system' ||
        row.stereo === 'reaction' ||
        !nonempty(row.ownerId) ||
        typeof row.content !== 'string'
    ) {
        return null;
    }
    const parentId = relayParentId(row.parentId, scope.channelId, chatNo);
    if (parentId === undefined) return null;
    if (!includeSelf && scope.viewerIds.includes(row.ownerId)) return null;
    const record = row.mention$;
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
    const mention = record as { userIds?: unknown; all?: unknown };
    if (!Array.isArray(mention.userIds) || !mention.userIds.every(nonempty)) return null;
    const mentionUserIds = viewerIdsOf(mention.userIds);
    if (!mentionUserIds.some(id => scope.viewerIds.includes(id))) return null;
    return {
        version: 1,
        cloudId: scope.cloudId,
        channelId: scope.channelId,
        messageId: row.id as string,
        chatNo,
        parentId,
        senderId: row.ownerId,
        content: row.content,
        mentionUserIds,
        mentionAll: mention.all === true || mention.all === 1,
        ...(typeof row.createdAtMs === 'number' && Number.isFinite(row.createdAtMs)
            ? { createdAt: row.createdAtMs }
            : {}),
    };
};

/** One local dev run arms once; route renders and later room visits cannot move its scope. */
export const createMentionRelay = (ports: RelayPorts) => {
    let state: 'idle' | 'arming' | 'armed' | 'stopped' = 'idle';
    let unsubscribe: (() => void) | undefined;
    let queue = Promise.resolve();
    const seen = new Set<string>();
    const stop = () => {
        state = 'stopped';
        ports.armed?.(null);
        unsubscribe?.();
        unsubscribe = undefined;
    };
    const offer = async (snapshot: RelaySnapshot): Promise<void> => {
        if (
            state !== 'idle' ||
            !snapshot.ready ||
            snapshot.channelName !== 'public' ||
            !snapshot.roomUserId ||
            !snapshot.membership ||
            !Number.isSafeInteger(snapshot.membership.joinedNo) ||
            snapshot.membership.joinedNo < 0
        ) {
            return;
        }
        const scope: RelayScope = {
            cloudId: snapshot.cloudId,
            channelId: snapshot.channelId,
            channelName: snapshot.channelName,
            viewerIds: viewerIdsOf(snapshot.viewerIds),
        };
        // The committed session uid can still belong to the previous cloud during a switch.
        // Only the uid resolved for this room's cloud has proven membership in this ID space.
        if (scope.viewerIds.some(id => id !== snapshot.roomUserId)) return;
        const firstBaseline = highestPersistedChatNo(snapshot.rows, scope);
        if (!nonempty(scope.cloudId) || !nonempty(scope.channelId) || !scope.viewerIds.length || firstBaseline <= 0) {
            return;
        }
        state = 'arming';
        const current = () => state !== 'stopped' && ports.isCurrentUser(scope.cloudId, snapshot.roomUserId);
        try {
            const config = await ports.config();
            if (!current()) {
                stop();
                return;
            }
            if (!config.enabled || config.channelName !== 'public' || !nonempty(config.token)) {
                stop();
                return;
            }
            if (config.scope && !matchesScope(config.scope, scope)) {
                ports.status('Stopped: the configured channel or viewer differs from this room.');
                stop();
                return;
            }
            const receipt = await ports.register(config.token, scope, config.baselineChatNo ?? firstBaseline);
            if (!current()) {
                stop();
                return;
            }
            if (
                !receipt.accepted ||
                !Number.isSafeInteger(receipt.baselineChatNo) ||
                (receipt.baselineChatNo as number) < 0
            ) {
                ports.status(`Registration refused: ${receipt.reason ?? 'invalid receipt'}`);
                stop();
                return;
            }
            const baseline = receipt.baselineChatNo as number;
            const token = config.token;
            state = 'armed';
            let membership: RelayMembership | null = null;
            let joinedNo = snapshot.membership.joinedNo;
            let latestRows = snapshot.rows;
            const eligible = (chatNo: number) =>
                current() && membership !== null && chatNo > Math.max(baseline, joinedNo);
            const receive = (rows: readonly RelayChat[]) => {
                latestRows = rows;
                if (!current()) {
                    stop();
                    return;
                }
                if (!membership) return;
                const ordered = [...rows].sort((a, b) => persistedChatNo(a, scope) - persistedChatNo(b, scope));
                for (const row of ordered) {
                    const chatNo = persistedChatNo(row, scope);
                    if (!eligible(chatNo) || seen.has(row.id as string)) continue;
                    // Remember non-mentions too: editing one into a mention is not a new message.
                    seen.add(row.id as string);
                    const event = mentionEventOf(row, scope, config.includeSelf === true);
                    if (!event) continue;
                    queue = queue.then(async () => {
                        if (!current()) {
                            stop();
                            return;
                        }
                        if (!eligible(event.chatNo)) return;
                        try {
                            const result = await ports.event(token, event, () => eligible(event.chatNo));
                            if (state === 'stopped') return;
                            ports.status(
                                result.status === 'queue-uncertain'
                                    ? 'Mention queue receipt uncertain; check the destination.'
                                    : result.accepted
                                      ? 'Mention submitted to the local queue.'
                                      : `Mention skipped: ${result.reason ?? 'refused'}`
                            );
                            if (!result.accepted && ['disabled', 'scope-mismatch'].includes(result.reason ?? '')) {
                                stop();
                            }
                        } catch {
                            if (!eligible(event.chatNo)) return;
                            ports.status(
                                'Delivery failed after bounded retries; reload to retry from the saved baseline.'
                            );
                        }
                    });
                }
            };
            const disposers: Array<() => void> = [];
            unsubscribe = () => disposers.splice(0).forEach(dispose => dispose());
            const retain = (dispose: () => void) => {
                if (current()) disposers.push(dispose);
                else {
                    stop();
                    dispose();
                }
            };
            retain(
                ports.observeMembership(scope, snapshot.roomUserId, value => {
                    if (!current() || !value || !Number.isSafeInteger(value.joinedNo) || value.joinedNo < 0) {
                        stop();
                        return;
                    }
                    const firstConfirmation = membership === null;
                    membership = value;
                    // Keep the strictest observed join cursor even if an older cache emission follows it.
                    joinedNo = Math.max(joinedNo, value.joinedNo);
                    if (firstConfirmation) {
                        if (config.includeSelf === true) ports.armed?.(scope);
                        ports.status(
                            'Armed for direct mentions in public, including self-sent messages when configured.'
                        );
                    }
                    receive(latestRows);
                })
            );
            if (!current()) return;
            retain(ports.observe(scope, receive));
            if (!current()) return;
            receive(snapshot.rows);
        } catch {
            ports.status('Setup failed; reload to retry.');
            stop();
        }
    };
    return { offer, stop, settled: () => queue };
};
