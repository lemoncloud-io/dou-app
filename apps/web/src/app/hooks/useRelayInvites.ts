import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useRuntimeGateways } from '@chatic/app-runtime';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type { InviteState } from '@lemoncloud/chatic-sockets-lib';

/** Invite view as `invite.get` returns it: the server also reports whether the reader must verify. */
export type RelayInviteView = MyInviteView & { needVerify?: boolean };

/**
 * The paged envelope `invite.list` answers with, narrowed to what the caller reads.
 *
 * Declared here rather than imported: the backend package publishes only its view types at the
 * package root, and the count it carries is the page's rather than the collection's — so paging
 * means asking for the next page and stopping on an empty one, and nothing else is usable.
 */
interface InviteListPage {
    list?: MyInviteView[];
}

/** Read/write the same cache entries, so a mutation can invalidate what the list hook renders. */
export const relayInviteKeys = {
    all: ['relayInvites'] as const,
    list: (state?: InviteState) => ['relayInvites', state ?? 'all'] as const,
};

/**
 * The inviter's own invite cards (`invite.list`), newest first.
 *
 * Polled rather than persisted: the backend has no accept notification yet, and invites have no
 * offline requirement, so ADR-0033 keeps them out of repositories-v2. Callers own the polling
 * cadence — this hook only refetches on window focus, which covers "user came back to the tab"
 * (see the query options for why that needs an explicit opt-out of the app's global `staleTime`).
 *
 * `total` on the response counts the page, not the collection, so it is not surfaced; ask for the
 * next page and stop when it comes back empty.
 */
export const useRelayInvites = (state?: InviteState) => {
    const { invite } = useRuntimeGateways();

    const query = useQuery({
        queryKey: relayInviteKeys.list(state),
        queryFn: async () => {
            const result = await invite.list<InviteListPage>(state ? { state } : null);
            return result?.list ?? [];
        },
        // Both options are load-bearing and must stay together. The app's QueryClient defaults to
        // `staleTime: Infinity` (app.tsx) — under it a focus refetch never fires, because react-query
        // only refetches queries it considers stale, so relying on the focus default alone would be a
        // no-op here. An invite changes on someone ELSE's device (the recipient accepts) and there is
        // no notification packet for it (백엔드 요청 #4), so coming back to the screen has to re-ask.
        staleTime: 0,
        refetchOnWindowFocus: true,
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
    const { invite } = useRuntimeGateways();
    const queryClient = useQueryClient();

    const invalidateList = () => queryClient.invalidateQueries({ queryKey: relayInviteKeys.all });

    const createMutation = useMutation({
        mutationFn: (input: { phone: string; name: string }) => invite.create<MyInviteView>(input),
        onSuccess: invalidateList,
    });

    // `invite.get` is a read, but it is code-driven rather than route-driven and must re-run on every
    // step transition to catch an expiry mid-flow, so it is a mutation instead of a cached query.
    const getMutation = useMutation({
        mutationFn: (code: string) => invite.get<RelayInviteView>({ code }),
    });

    const acceptMutation = useMutation({
        // Idempotent server-side: re-accepting the same code after a dropped connection succeeds.
        mutationFn: (code: string) => invite.accept<MyInviteView>({ code }),
        onSuccess: invalidateList,
    });

    return {
        createInvite: (input: { phone: string; name: string }) => createMutation.mutateAsync(input),
        getInvite: (code: string) => getMutation.mutateAsync(code),
        acceptInvite: (code: string) => acceptMutation.mutateAsync(code),
        isPending: createMutation.isPending || getMutation.isPending || acceptMutation.isPending,
    };
};
