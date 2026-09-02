import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getSocketManager, useKindVerified, useRuntimeRepositories } from '@chatic/app-runtime';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type { InviteState } from '@lemoncloud/chatic-sockets-lib';

/** Invite view as `invite.get` returns it: the server also reports whether the reader must verify. */
export type RelayInviteView = MyInviteView & { needVerify?: boolean };

/**
 * A sent-invite row as `useRelayInvites` renders it. `dismissedAt` is a local-only stamp
 * (ADR-0052) — the server never returns it, so it only ever arrives via the cache merge below.
 */
export type RelayInviteRow = MyInviteView & { dismissedAt?: number };

/**
 * What issuing an invite takes. `phone` is E.164 (`+821012345678`), not the local (`0…`) form —
 * the backend's phone hasher only reads `countryCode` on a local number and silently ignores it
 * once the string starts with `+`, so E.164 is the one shape that hashes correctly with or without
 * a trustworthy `countryCode` (ADR-0044 §5 correction). `countryCode` is still accepted and worth
 * sending — omitting it lets the server apply its own default of `KR` — it was left out of this
 * type while the app was Korea-only, which made passing one impossible (ADR-0044 §2).
 */
export interface RelayInviteCreateInput {
    phone: string;
    name: string;
    countryCode?: string;
}

/**
 * How many invite cards to ask for in one `invite.list`.
 *
 * Explicit because the server's default page size is small enough that a sender who has issued a
 * while accumulates rows past it, and this hook does not page — an invite outside the window simply
 * stops appearing (a sent-invite row vanishes, and `resolveReinviteVariant` sees `undefined` and
 * offers the wrong copy). One larger page is the cheap fix; real paging stays open until the list
 * has a reason to grow past this.
 */
export const INVITE_LIST_LIMIT = 100;

/**
 * How long a caller-driven `refetch` waits for the relay handshake before giving up (ms).
 *
 * Every refetch here is user-driven (a cancel/reissue tap that needs the invite `code`, which the
 * durable cache deliberately never holds — ADR-0052), so waiting beats failing: on a cold boot or
 * right after a reconnect the handshake is 1-2s away and the tap succeeds a moment later. Well
 * under the manager's 10s default, because a person is watching a button.
 */
const REFETCH_VERIFY_TIMEOUT_MS = 3_000;

export interface RelayInvitesOptions {
    /**
     * Re-ask this often while the caller is mounted (off by default).
     *
     * Deliberately react-query's own `refetchInterval` rather than a caller-side `setInterval` +
     * `refetch()`: a manual `refetch()` fires even while the query is DISABLED (TanStack v5), so a
     * poll built that way punches straight through the relay gate below and hits the socket while
     * relay is unauthenticated — `401 UNAUTHORIZED - not authenticated @invite.list`. The interval
     * is per-observer, so only the caller that asks for it polls, and it also pauses while the
     * window is in the background (`refetchIntervalInBackground` defaults to false).
     */
    pollIntervalMs?: number;

    /**
     * Whether to ask the SERVER at all (off by default; `pollIntervalMs` implies it).
     *
     * Off makes this a pure cache reader: it renders the local invite cache — which `invite.list`,
     * `invite.create` and `invite.cancel` all mirror into — and never puts a packet on the wire.
     * That is the right default because home mounts this for EVERY user, including the majority who
     * have never sent an invite, and the old default (`staleTime: 0` + focus refetch, i.e. one
     * `invite.list` per home mount AND per window focus, doubled by the app's `retry: 1`) made this
     * the most frequently sent relay-pinned read in the app. It was therefore the packet that
     * surfaced every connection-auth desync as `401 UNAUTHORIZED - not authenticated invite.list`.
     *
     * What keeps a cache reader fresh instead: `useBackgroundSync` re-asks `invite.list` on the same
     * triggers as the channel/place/profile lane (verified rising edge, foreground return, and the
     * 60s tick while a `pending` card is live), and the response mirrors back into the cache this
     * hook observes. Surfaces needing a cadence of their own (the waiting screen) pass
     * `pollIntervalMs`; surfaces needing the `code` a cache row never carries re-ask on demand
     * through `refetch`.
     */
    remote?: boolean;
}

/** Read/write the same cache entries, so a mutation can invalidate what the list hook renders. */
export const relayInviteKeys = {
    all: ['relayInvites'] as const,
    list: (state?: InviteState) => ['relayInvites', state ?? 'all'] as const,
};

/**
 * Merges the local cache with the latest server response: the response wins per id for every
 * SERVER-owned field (it carries `code`, the cache never does) and keeps the server's own order,
 * while any cache-only row — fallen out of the `limit: 100` window, or simply not confirmed yet
 * because the response hasn't landed — is appended after, in the cache's own newest-first order
 * (ADR-0052 결정 4).
 *
 * `dismissedAt` rides along separately: it is a LOCAL-only field the server response never
 * carries, so a naive "remote wins outright" would silently erase a dismiss the moment the row's
 * server state refreshes — exactly the "dismiss survives" guarantee (ADR-0052 결정 5, S4) this
 * merge exists to keep. A matched cache row's `dismissedAt` is carried onto the remote-sourced
 * row instead of being dropped.
 *
 * When `remote` is empty (cold boot before `invite.list` resolves, or offline) the result is pure
 * cache order. When `remote` fully covers what the cache has and nothing is dismissed, the result
 * is exactly `remote`, unreordered — the pass-through behavior every existing consumer relies on.
 */
const mergeCachedAndRemoteInvites = (cached: RelayInviteRow[], remote: MyInviteView[]): RelayInviteRow[] => {
    const cachedById = new Map(cached.filter(item => item.id).map(item => [item.id as string, item]));

    const merged = remote.map(item => {
        const dismissedAt = item.id ? cachedById.get(item.id)?.dismissedAt : undefined;
        return dismissedAt ? { ...item, dismissedAt } : item;
    });

    const remoteIds = new Set(remote.map(item => item.id).filter(Boolean));
    const cacheOnly = cached.filter(item => item.id && !remoteIds.has(item.id));
    return [...merged, ...cacheOnly];
};

/**
 * The inviter's own invite cards (`invite.list`), newest first.
 *
 * Read through `InviteRepositoryV2` like every other data access (ADR-0036) — the repository is an
 * access surface, not a cache obligation, so each call still goes straight to the relay-pinned
 * gateway behind it.
 *
 * Local-first since ADR-0052: a local cache observer renders instantly on cold boot (before the
 * relay handshake even completes) or offline. Since the invite lane moved into `useBackgroundSync`,
 * the cache is ALL a default caller renders — the server read is opt-in (`remote`/`pollIntervalMs`)
 * and the background lane owns the cadence that keeps cards someone ELSE's device changed
 * converging. The cache is still never trusted for state; it is what to paint until the lane's next
 * answer mirrors in.
 */
export const useRelayInvites = (state?: InviteState, options: RelayInvitesOptions = {}) => {
    const { invite } = useRuntimeRepositories();
    // invite.list is relay-pinned (kind-scoped routing), so gate on the RELAY slot specifically —
    // the active-facade isVerified would track cloud instead whenever a cloud session is up, and
    // firing before relay's own handshake completes is exactly what threw `503 SOCKET NOT
    // CONNECTED - relay.request(invite.list)` on cold boot / window-focus refetch.
    const isRelayVerified = useKindVerified('relay');
    // Whether this consumer wants the server at all. Asking for a poll is asking for the server, so
    // the waiting screen needs no second flag (see RelayInvitesOptions.remote).
    const wantsRemote = options.remote ?? options.pollIntervalMs !== undefined;

    const [cachedInvites, setCachedInvites] = useState<RelayInviteRow[]>([]);
    useEffect(() => {
        return invite.observeList(result => {
            setCachedInvites((result?.list ?? []) as RelayInviteRow[]);
        });
    }, [invite]);

    const query = useQuery({
        queryKey: relayInviteKeys.list(state),
        queryFn: () => invite.list({ limit: INVITE_LIST_LIMIT, ...(state ? { state } : {}) }),
        // Both options are load-bearing and must stay together. The app's QueryClient defaults to
        // `staleTime: Infinity` (app.tsx) — under it a focus refetch never fires, because react-query
        // only refetches queries it considers stale, so relying on the focus default alone would be a
        // no-op here. An invite changes on someone ELSE's device (the recipient accepts) and there is
        // no notification packet for it (백엔드 요청 #4), so coming back to the screen has to re-ask.
        staleTime: 0,
        refetchOnWindowFocus: true,
        // Off unless a caller asks (see RelayInvitesOptions) — react-query skips it while disabled.
        refetchInterval: options.pollIntervalMs ?? false,
        // Never retried, against the app-wide `retry: 1`: a retry turns one failure into two packets
        // (and two server-side error reports) for a read the next background-sync edge/tick or poll
        // re-asks anyway. Nothing here needs its answer within a single attempt.
        retry: false,
        // Two gates, and both must hold. `isRelayVerified` re-fires on the false→true edge (relay
        // reconnecting drops it, then restores it), same as every other verified-gated read in the
        // app. `wantsRemote` is the stronger one: a cache-only consumer never opens the wire at all.
        // `refetch()` still works while disabled (TanStack v5), which is what the on-demand
        // code re-ask and the user-driven retry on InviteWaitingPage ride on — and also why an
        // automatic cadence must NOT be built on it (see RelayInvitesOptions.pollIntervalMs).
        enabled: isRelayVerified && wantsRemote,
    });

    const invites = mergeCachedAndRemoteInvites(cachedInvites, query.data ?? []);

    /**
     * Caller-driven re-ask, gated the way the query itself is.
     *
     * react-query's `refetch()` fires even while a query is DISABLED (TanStack v5), so handing
     * `query.refetch` out raw punched straight through the relay gate above — every cancel/reissue
     * tap on a cache-first row (the rows that carry no `code`, hence the ones that need this
     * re-ask) hit the socket while relay was still unauthenticated and the server answered
     * `401 UNAUTHORIZED - not authenticated @invite.list`, twice per tap under the app's `retry: 1`.
     *
     * So wait for the slot instead of racing it, and when the wait times out answer from what is
     * already in hand rather than putting a doomed packet on the wire. The shape matches
     * `query.refetch`'s in the one field callers read (`data`), which is all `resolveInviteCode`
     * needs.
     */
    const refetch = useCallback(async (): Promise<{ data?: MyInviteView[] }> => {
        if (!isRelayVerified) {
            const verified = await getSocketManager().waitUntilKindVerified('relay', REFETCH_VERIFY_TIMEOUT_MS);
            if (!verified) return { data: query.data };
        }
        return query.refetch();
        // `query.refetch` is stable per query instance; `query.data` is only read on the timeout path.
    }, [isRelayVerified, query.refetch, query.data]);

    return {
        invites,
        // A cache hit already has something to paint, so the loading spinner is reserved for the
        // genuinely empty case (nothing cached, response not back yet) — the cold-boot win ADR-0052
        // exists for. A cache-only consumer never has a response pending, so this is simply false
        // for it: nothing is on the way, and a spinner would wait forever.
        isLoading: query.isLoading && invites.length === 0,
        refetch,
    };
};

/**
 * Issue / inspect / redeem an invite code.
 *
 * Deliberately promise-returning rather than exposing mutation objects: every caller is a step in a
 * sequence (issue then hand off the deeplink; inspect then verify then accept), so awaiting reads
 * better than chaining callbacks. Failures reject — branch on `getSocketErrorCode`, never on the
 * message. Expiry and prior acceptance are NOT failures; they arrive as `state`.
 *
 * The code is a credential, not an identifier: it goes in the packet body only, and never into a
 * query key, a log, or a URL other than the deeplink itself.
 */
export const useRelayInviteMutations = () => {
    const { invite } = useRuntimeRepositories();
    const queryClient = useQueryClient();

    const invalidateList = () => queryClient.invalidateQueries({ queryKey: relayInviteKeys.all });

    const createMutation = useMutation({
        mutationFn: (input: RelayInviteCreateInput) => invite.create(input),
        onSuccess: invalidateList,
    });

    // `invite.get` is a read, but it is code-driven rather than route-driven and must re-run on every
    // step transition to catch an expiry mid-flow, so it is a mutation instead of a cached query.
    const getMutation = useMutation({
        mutationFn: (code: string) => invite.get(code),
    });

    const acceptMutation = useMutation({
        // Idempotent server-side: re-accepting the same code after a dropped connection succeeds.
        mutationFn: (code: string) => invite.accept(code),
        onSuccess: invalidateList,
    });

    // Cancel/reject are final and idempotent (ADR-0043): the response's `state` is the whole
    // verdict, and re-firing after a dropped connection cannot move the recorded timestamp.
    // A 409 rejects — it means the invite got accepted meanwhile, and callers re-ask the list.
    const cancelMutation = useMutation({
        mutationFn: (code: string) => invite.cancel(code),
        onSuccess: invalidateList,
    });

    const rejectMutation = useMutation({
        mutationFn: (code: string) => invite.reject(code),
        onSuccess: invalidateList,
    });

    return {
        createInvite: (input: RelayInviteCreateInput) => createMutation.mutateAsync(input),
        getInvite: (code: string) => getMutation.mutateAsync(code),
        acceptInvite: (code: string) => acceptMutation.mutateAsync(code),
        cancelInvite: (code: string) => cancelMutation.mutateAsync(code),
        rejectInvite: (code: string) => rejectMutation.mutateAsync(code),
        isPending:
            createMutation.isPending ||
            getMutation.isPending ||
            acceptMutation.isPending ||
            cancelMutation.isPending ||
            rejectMutation.isPending,
    };
};
