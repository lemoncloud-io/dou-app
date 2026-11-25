import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/runtime-react';
import type { DomainCloud } from '@chatic/runtime-react';

import { useCloudSessionCatalog } from './useCloudCatalog';

import { useJoinedCloudsStore } from '../stores';

export interface RailCloud {
    id: string;
    name?: string;
    status?: string;
    kind: 'home' | 'owned' | 'invited';
}

export const isLapsedCloud = (cloud: Pick<RailCloud, 'status'>): boolean =>
    cloud.status === 'suspended' || cloud.status === 'expired';

export const isExpiredCloud = (cloud: Pick<RailCloud, 'status'>): boolean => cloud.status === 'expired';

export const canCreatePlace = (
    clouds: readonly RailCloud[],
    activeCloudId: string | null,
    role: { isGuest: boolean; isCloudActive: boolean; canManage: boolean }
): boolean => {
    if (role.isGuest || !role.isCloudActive || !role.canManage || !activeCloudId) return false;
    const active = clouds.find(cloud => cloud.id === activeCloudId);
    return active?.kind === 'owned' && !isLapsedCloud(active);
};

export const useClouds = () => {
    const { t } = useTranslation();
    const { clouds: rawClouds, isFetchingClouds, isCloudsError, refetchClouds } = useCloudSessionCatalog();
    const { cloud: cloudRepository } = runtime.data.useRuntimeRepositories();
    const allJoinedClouds = useJoinedCloudsStore(s => s.joinedClouds);
    const session = runtime.session.useGlobalSession();
    const acceptorId = runtime.data.getAcceptorId();
    const [allCachedClouds, setCachedClouds] = useState<DomainCloud[]>([]);
    const activeCloudId = session.cloud.cloudId || (!isFetchingClouds && rawClouds.length === 0 ? 'default' : null);

    useEffect(() => cloudRepository.observeList(result => setCachedClouds(result?.list ?? [])), [cloudRepository]);

    const joinedClouds = useMemo(
        () =>
            Object.fromEntries(
                Object.entries(allJoinedClouds).filter(([, j]) => !!acceptorId && j.ownerUid === acceptorId)
            ),
        [allJoinedClouds, acceptorId]
    );
    const cachedClouds = useMemo(
        () => allCachedClouds.filter(c => c.cloudType !== 'invited' || runtime.data.isAcceptedBy(c, acceptorId)),
        [allCachedClouds, acceptorId]
    );

    const clouds = useMemo<RailCloud[]>(() => {
        const byId = new Map<string, RailCloud>();
        const joinedName = (id: string) => joinedClouds[id]?.name;
        const invitedTile = (id: string, name?: string): RailCloud => ({
            id,
            name: name ?? joinedName(id),
            status: 'active',
            kind: 'invited',
        });

        const cachedName = (id: string) => cachedClouds.find(cached => cached.id === id)?.name || undefined;

        for (const c of rawClouds) {
            if (c.id && c.id !== 'default') {
                const name = cachedName(c.id) ?? c.name ?? joinedName(c.id);
                byId.set(c.id, { id: c.id, name, status: c.status as string | undefined, kind: 'owned' });
            }
        }
        for (const c of cachedClouds) {
            if (c.cloudType === 'invited' && c.id && c.id !== 'default' && !byId.has(c.id)) {
                byId.set(c.id, invitedTile(c.id, c.name));
            }
        }
        for (const j of Object.values(joinedClouds)) {
            if (j.id !== 'default' && !byId.has(j.id)) byId.set(j.id, invitedTile(j.id, j.name));
        }
        if (activeCloudId && activeCloudId !== 'default' && !byId.has(activeCloudId)) {
            byId.set(activeCloudId, invitedTile(activeCloudId));
        }
        const home: RailCloud = { id: 'default', name: t('cloud.home'), status: 'active', kind: 'home' };
        return [home, ...byId.values()];
    }, [rawClouds, cachedClouds, joinedClouds, activeCloudId, t]);

    const ownedAlsoInvitedIds = useMemo(() => {
        const ownedIds = new Set(rawClouds.map(c => c.id).filter((id): id is string => !!id && id !== 'default'));
        return cachedClouds
            .filter(c => c.cloudType === 'invited' && !!c.id && ownedIds.has(c.id))
            .map(c => c.id as string);
    }, [rawClouds, cachedClouds]);

    return { clouds, activeCloudId, isFetchingClouds, isCloudsError, refetchClouds, ownedAlsoInvitedIds };
};
