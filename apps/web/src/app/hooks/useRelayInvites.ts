import { useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type { InviteState } from '@lemoncloud/chatic-sockets-lib';

export type RelayInviteView = MyInviteView & { needVerify?: boolean };

export type RelayInviteRow = MyInviteView & { dismissedAt?: number };

export interface RelayInviteCreateInput {
    phone: string;
    name: string;
    countryCode?: string;
    channelId?: string;
    expiresDays?: number;
}

export const INVITE_LIST_LIMIT = 100;

export const INVITE_EXPIRES_DAYS = 1;

const REFETCH_VERIFY_TIMEOUT_MS = 3_000;

export interface RelayInvitesOptions {
    pollIntervalMs?: number;

    remote?: boolean;

    enabled?: boolean;
}

export const relayInviteKeys = {
    all: ['relayInvites'] as const,
    list: (state?: InviteState) => ['relayInvites', state ?? 'all'] as const,
};

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

export const useRelayInvites = (state?: InviteState, options: RelayInvitesOptions = {}) => {
    const { invite } = runtime.data.useRuntimeRepositories();
    const isRelayVerified = runtime.connection.useSlotVerified(runtime.connection.RELAY_SLOT);
    const wantsRemote = options.remote ?? options.pollIntervalMs !== undefined;

    const isEnabled = options.enabled ?? true;

    const [cachedInvites, setCachedInvites] = useState<RelayInviteRow[]>([]);
    useEffect(() => {
        if (!isEnabled) {
            setCachedInvites([]);
            return;
        }
        return invite.observeList(result => {
            setCachedInvites((result?.list ?? []) as RelayInviteRow[]);
        });
    }, [invite, isEnabled]);

    const query = useQuery({
        queryKey: relayInviteKeys.list(state),
        queryFn: () => invite.list({ limit: INVITE_LIST_LIMIT, ...(state ? { state } : {}) }),
        staleTime: 0,
        refetchOnWindowFocus: true,
        refetchInterval: options.pollIntervalMs ?? false,
        retry: false,
        enabled: isRelayVerified && wantsRemote && isEnabled,
    });

    const invites = mergeCachedAndRemoteInvites(cachedInvites, query.data ?? []);

    const refetch = useCallback(async (): Promise<{ data?: MyInviteView[] }> => {
        if (!isRelayVerified) {
            const verified = await runtime.connection.waitUntilVerified(
                runtime.connection.RELAY_SLOT,
                REFETCH_VERIFY_TIMEOUT_MS
            );
            if (!verified) return { data: query.data };
        }
        return query.refetch();
    }, [isRelayVerified, query.refetch, query.data]);

    return {
        invites,
        isLoading: query.isLoading && invites.length === 0,
        refetch,
    };
};

export const useRelayInviteMutations = () => {
    const { invite } = runtime.data.useRuntimeRepositories();
    const queryClient = useQueryClient();

    const invalidateList = () => queryClient.invalidateQueries({ queryKey: relayInviteKeys.all });

    const createMutation = useMutation({
        mutationFn: (input: RelayInviteCreateInput) =>
            invite.create({ ...input, expiresDays: input.expiresDays ?? INVITE_EXPIRES_DAYS }),
        onSuccess: invalidateList,
    });

    const getMutation = useMutation({
        mutationFn: (code: string) => invite.get(code),
    });

    const acceptMutation = useMutation({
        mutationFn: (code: string) => invite.accept(code),
        onSuccess: invalidateList,
    });

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
