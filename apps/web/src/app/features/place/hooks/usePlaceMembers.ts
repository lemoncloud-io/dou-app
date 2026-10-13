import { useIsMutating } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import type { DomainPlaceMember } from '@chatic/data';

import { useSelectedCloudId } from '../../../hooks';
import { getSocketErrorCode } from '../../../utils/errors';

/**
 * - `loading`: no answer yet, including while the cloud's socket is not verified.
 * - `forbidden`: the server answered `403` — I am not a member of this place.
 * - `error`: any other failure. There is no stand-in list: the union of my rooms' rosters is not
 *   "the members of this place", and on a management screen a wrong list is worse than none.
 */
export type PlaceMembersStatus = 'loading' | 'ready' | 'error' | 'forbidden';

export interface UsePlaceMembersResult {
    /** In the server's order; the screen orders them for display. */
    members: DomainPlaceMember[];
    status: PlaceMembersStatus;
    /** Asks the server again. */
    retry: () => void;
    /**
     * Takes one member out of the list held here, without asking again — used after a removal. The
     * server's list catches up late, so a fresh read straight after could show the person again; the
     * member is therefore also kept out of any later answer for the same place while the screen is
     * open (a reconnect reads the list again). Bound to the scope it was handed out in, so a removal
     * that settles after the screen moved to another place edits nothing there.
     */
    dropMember: (userId: string) => void;
}

interface Settled {
    key: string;
    members: DomainPlaceMember[] | null;
    status: Exclude<PlaceMembersStatus, 'loading'>;
}

/**
 * The members of one place, read with `place.list-user` each time the screen opens. Nothing is
 * cached: a reopened screen reads again.
 *
 * Profiles ride along only when the session is on this place — the same rule the invite picker
 * follows (`sessionPlaceId` is null while a switch is in flight). On any other place the rows fall
 * back to the user's own name and picture, with nothing said about it.
 *
 * An answer is kept only while it still names the cloud and place on screen: one that arrives after
 * the screen moved would otherwise show another place's people.
 */
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
    // Read when the request is sent, not a reason to send another: a switch settling while the
    // screen is open would otherwise re-read the list and could bring back a member just removed.
    const sessionPlaceIdRef = useRef(sessionPlaceId);
    sessionPlaceIdRef.current = sessionPlaceId;

    const scopeKey = placeId ? `${cid}|${placeId}` : '';
    const scopeKeyRef = useRef(scopeKey);
    scopeKeyRef.current = scopeKey;

    const [attempt, setAttempt] = useState(0);
    const [settled, setSettled] = useState<Settled | null>(null);
    // scope key → members removed from it while this screen has been open.
    const removedRef = useRef(new Map<string, Set<string>>());

    useEffect(() => {
        if (!placeId || !isVerified) return;
        let cancelled = false;
        setSettled(prev => (prev?.key === scopeKey ? null : prev));
        userRepository
            .listPlaceMembers({ placeId, sessionPlaceId: sessionPlaceIdRef.current })
            .then(result => {
                if (cancelled) return;
                // Stale: the answer names a scope the screen has left.
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
