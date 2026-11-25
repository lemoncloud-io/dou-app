import { useIsMutating } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { runtime, type DomainPlaceMember } from '@chatic/runtime-react';

import { useSelectedCloudId } from '../../../hooks';
import { getSocketErrorCode } from '../../../utils/errors';

export type PlaceMembersStatus = 'loading' | 'ready' | 'error' | 'forbidden';

export interface UsePlaceMembersResult {
    members: DomainPlaceMember[];
    status: PlaceMembersStatus;
    retry: () => void;
    dropMember: (userId: string) => void;
}

interface Settled {
    key: string;
    members: DomainPlaceMember[] | null;
    status: Exclude<PlaceMembersStatus, 'loading'>;
}

export const usePlaceMembers = (placeId: string | null): UsePlaceMembersResult => {
    const { user: userRepository } = runtime.data.useRuntimeRepositories();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const cid = useSelectedCloudId();
    const isVerified = runtime.connection.useCloudVerified(cid);
    const isSwitching =
        useIsMutating({ mutationKey: runtime.session.SWITCH_SITE_MUTATION_KEY }) +
            useIsMutating({ mutationKey: runtime.session.SWITCH_CLOUD_MUTATION_KEY }) >
        0;
    const sessionPlaceId = isSwitching ? null : selectedSiteId;
    const sessionPlaceIdRef = useRef(sessionPlaceId);
    sessionPlaceIdRef.current = sessionPlaceId;

    const scopeKey = placeId ? `${cid}|${placeId}` : '';
    const scopeKeyRef = useRef(scopeKey);
    scopeKeyRef.current = scopeKey;

    const [attempt, setAttempt] = useState(0);
    const [settled, setSettled] = useState<Settled | null>(null);
    const removedRef = useRef(new Map<string, Set<string>>());

    useEffect(() => {
        if (!placeId || !isVerified) return;
        let cancelled = false;
        setSettled(prev => (prev?.key === scopeKey ? null : prev));
        userRepository
            .listPlaceMembers({ placeId, sessionPlaceId: sessionPlaceIdRef.current })
            .then(result => {
                if (cancelled) return;
                if (`${result.context.cid}|${result.context.sid}` !== scopeKeyRef.current) return;
                const removed = removedRef.current.get(scopeKey);
                const members = removed ? result.members.filter(member => !removed.has(member.id)) : result.members;
                setSettled({ key: scopeKey, members, status: 'ready' });
            })
            .catch(error => {
                if (cancelled) return;
                const status = getSocketErrorCode(error) === 403 ? 'forbidden' : 'error';
                setSettled({ key: scopeKey, members: null, status });
            });
        return () => {
            cancelled = true;
        };
    }, [userRepository, placeId, scopeKey, isVerified, attempt]);

    const retry = useCallback(() => setAttempt(n => n + 1), []);
    const dropMember = useCallback(
        (userId: string) => {
            const removed = removedRef.current.get(scopeKey) ?? new Set<string>();
            removed.add(userId);
            removedRef.current.set(scopeKey, removed);
            setSettled(prev =>
                prev?.key === scopeKey && prev.members
                    ? { ...prev, members: prev.members.filter(member => member.id !== userId) }
                    : prev
            );
        },
        [scopeKey]
    );

    const current = settled?.key === scopeKey ? settled : null;
    return {
        members: current?.members ?? [],
        status: current?.status ?? 'loading',
        retry,
        dropMember,
    };
};
