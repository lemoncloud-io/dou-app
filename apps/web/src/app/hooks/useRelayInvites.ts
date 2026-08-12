import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useKindVerified, useRuntimeRepositories } from '@chatic/app-runtime';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type { InviteState } from '@lemoncloud/chatic-sockets-lib';

/** Invite view as `invite.get` returns it: the server also reports whether the reader must verify. */
export type RelayInviteView = MyInviteView & { needVerify?: boolean };

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
const INVITE_LIST_LIMIT = 100;

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
}

/** Read/write the same cache entries, so a mutation can invalidate what the list hook renders. */
export const relayInviteKeys = {
    all: ['relayInvites'] as const,
    list: (state?: InviteState) => ['relayInvites', state ?? 'all'] as const,
};

/**
 * The inviter's own invite cards (`invite.list`), newest first.
 *
 * Read through `InviteRepositoryV2` like every other data access (ADR-0036) — the repository is an
 * access surface, not a cache obligation, so each call still goes straight to the relay-pinned
 * gateway behind it. By default it only refetches on window focus, which covers "user came back to
 * the tab" (see the query options for why that needs an explicit opt-out of the app's global
 * `staleTime`); a caller that needs a cadence on top asks for it with `pollIntervalMs`.
 */
export const useRelayInvites = (state?: InviteState, options: RelayInvitesOptions = {}) => {
    const { invite } = useRuntimeRepositories();
    // invite.list is relay-pinned (kind-scoped routing), so gate on the RELAY slot specifically —
    // the active-facade isVerified would track cloud instead whenever a cloud session is up, and
    // firing before relay's own handshake completes is exactly what threw `503 SOCKET NOT
    // CONNECTED - relay.request(invite.list)` on cold boot / window-focus refetch.
    const isRelayVerified = useKindVerified('relay');

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
        // Re-fires on the false→true edge (relay reconnecting drops this to false, then back), same
        // as every other isVerified-gated read in the app. `refetch()` still works while disabled
        // (TanStack v5), so the user-driven retry on InviteWaitingPage is unaffected — that is also
        // why an automatic cadence must NOT be built on it (see RelayInvitesOptions.pollIntervalMs).
        enabled: isRelayVerified,
    });

    return {
        invites: query.data ?? [],
        isLoading: query.isLoading,
        refetch: query.refetch,
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
