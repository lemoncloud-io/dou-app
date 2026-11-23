import { useCallback, useEffect, useRef, useState } from 'react';

import { runtime } from '@chatic/runtime';
import {
    buildMiniAppLaunchParams,
    checkMiniAppLink,
    MINI_APP_LINK_LIMIT,
    type MiniAppLink,
    type MiniAppLinkProblem,
    parseMiniAppLinks,
    subWebViewTrustOf,
    type SubWebViewTrust,
} from '@chatic/shared';

import { openSubWebView, type SubWebViewOpening } from '../../../bridge/subWebView';
import { miniAppHubUrl } from '../../../bridge/subWebViewApps';
import { useActiveCloudPlaces, useInvitedClouds, useMyProfile } from '../../../hooks';
import { useCloudSessionCatalog } from '../../../hooks/useCloudCatalog';
import { deviceStore } from '../../../storage';
import { isDevBuild } from '../../../utils/buildEnv';
import { cloudDisplayName } from '../../../utils/cloudDisplayName';

const linksKey = (cloudId: string) => `dou.miniAppLinks.${cloudId}`;
const consentKey = (accountId: string, host: string) => `dou.miniAppConsent.${accountId}.${host}`;

const readLinks = (cloudId: string | null): MiniAppLink[] =>
    cloudId ? parseMiniAppLinks(deviceStore.get(linksKey(cloudId))) : [];

const writeLinks = (cloudId: string, links: readonly MiniAppLink[]): boolean => {
    const key = linksKey(cloudId);
    const value = links.length === 0 ? null : JSON.stringify(links);
    if (value === null) deviceStore.remove(key);
    else deviceStore.set(key, value);
    return deviceStore.get(key) === value;
};

const newLinkId = (): string =>
    Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');

const hasConsent = (accountId: string | null | undefined, host: string): boolean =>
    !!accountId && deviceStore.get(consentKey(accountId, host)) === '1';

const writeConsent = (accountId: string | null | undefined, host: string): void => {
    if (accountId) deviceStore.set(consentKey(accountId, host), '1');
};

type HubRequest = { kind: 'linkSettings' } | { kind: 'open'; id: string } | null;

const hubRequestOf = (result: unknown): HubRequest => {
    if (!result || typeof result !== 'object') return null;
    const { action, id } = result as { action?: unknown; id?: unknown };
    if (action === 'openMiniAppLinkSettings') return { kind: 'linkSettings' };
    if (action === 'openMiniApp' && typeof id === 'string') return { kind: 'open', id };
    return null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const realName = (name: string): string | null => {
    const trimmed = name.trim();
    return trimmed && trimmed !== 'Unknown' && !UUID.test(trimmed) ? trimmed : null;
};

const hostOf = (url: string): string => new URL(url).host;

export type MiniAppLinkSave = 'saved' | MiniAppLinkProblem | 'full' | 'failed';

export type MiniAppLinkEditing = MiniAppLink | 'new';

export type MiniAppOpenOutcome = 'opened' | 'outside' | 'failed';

export const useMiniAppLauncher = ({ onOpened }: { onOpened?: (outcome: MiniAppOpenOutcome) => void } = {}) => {
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const cloudId = selectedCloudId && selectedCloudId !== 'default' ? selectedCloudId : null;
    const { clouds } = useCloudSessionCatalog();
    const ownedCloud = clouds.find(cloud => cloud.id === cloudId);
    const isOwner = !!ownedCloud;
    const { invitedClouds } = useInvitedClouds();
    const invitedCloud = invitedClouds.find(cloud => cloud.id === cloudId);
    const cloudName = ownedCloud ? cloudDisplayName(ownedCloud) : (invitedCloud?.name ?? '');
    const { places } = useActiveCloudPlaces();
    const place = places.find(candidate => candidate.id === selectedSiteId);
    const uid = runtime.session.useUidInCloud(cloudId ?? '');
    const { userId: accountId } = runtime.session.useSessionIdentity();
    const placeNick = useMyProfile().profile?.nick;
    const profileName = realName(runtime.session.useRuntimeProfile().userName);

    const [stored, setStored] = useState(() => ({ cloudId, links: readLinks(cloudId) }));
    const [editing, setEditing] = useState<MiniAppLinkEditing | null>(null);
    const [pendingConsent, setPendingConsent] = useState<string | null>(null);
    if (stored.cloudId !== cloudId) {
        setStored({ cloudId, links: readLinks(cloudId) });
        setEditing(null);
        setPendingConsent(null);
    }
    const links = stored.cloudId === cloudId ? stored.links : readLinks(cloudId);
    const canAdd = isOwner && links.length < MINI_APP_LINK_LIMIT;

    const opening = useRef(false);
    const openedHub = useRef<{ viewId: string; cloudId: string } | null>(null);
    const onOpenedRef = useRef(onOpened);
    onOpenedRef.current = onOpened;
    const answerHub = useRef<(hubCloudId: string, request: HubRequest) => void>(() => undefined);

    useEffect(
        () =>
            runtime.links.subWebView?.onClosed(closed => {
                const hub = openedHub.current;
                if (!closed || closed.viewId !== hub?.viewId) return;
                openedHub.current = null;
                answerHub.current(hub.cloudId, hubRequestOf(closed.result));
            }),
        []
    );

    const launch = useCallback(
        async (url: string, trust: SubWebViewTrust) => {
            if (!cloudId || opening.current) return;
            if (!uid) {
                onOpenedRef.current?.('failed');
                return;
            }
            opening.current = true;
            const params = buildMiniAppLaunchParams(
                {
                    cloud: { id: cloudId, name: cloudName },
                    place: place ? { id: place.id, name: place.name ?? '' } : null,
                    user: { id: uid, placeNick, profileName },
                    isOwner,
                    miniApps: links,
                },
                trust
            );
            try {
                const opened: SubWebViewOpening = await openSubWebView({ url, params });
                openedHub.current =
                    opened.via === 'subWebView' && trust === 'firstParty' ? { viewId: opened.viewId, cloudId } : null;
                onOpenedRef.current?.(opened.via === 'subWebView' ? 'opened' : 'outside');
            } catch {
                onOpenedRef.current?.('failed');
            } finally {
                opening.current = false;
            }
        },
        [cloudId, uid, cloudName, place, placeNick, profileName, isOwner, links]
    );

    const openPage = useCallback(
        (link: MiniAppLink | null) => {
            const url = link?.url ?? miniAppHubUrl(isDevBuild() ? 'dev' : 'prod');
            const trust = subWebViewTrustOf(url);
            if (!trust) return;
            if (trust === 'external' && !hasConsent(accountId, hostOf(url))) {
                setPendingConsent(url);
                return;
            }
            void launch(url, trust);
        },
        [launch, accountId]
    );

    useEffect(() => {
        answerHub.current = (hubCloudId, request) => {
            if (!request || hubCloudId !== cloudId) return;
            if (request.kind === 'linkSettings') {
                if (isOwner) setEditing('new');
                return;
            }
            const link = links.find(candidate => candidate.id === request.id);
            if (link) openPage(link);
        };
    }, [cloudId, isOwner, links, openPage]);

    const answerConsent = useCallback(
        (agreed: boolean) => {
            const url = pendingConsent;
            setPendingConsent(null);
            if (!agreed || !url) return;
            writeConsent(accountId, hostOf(url));
            void launch(url, 'external');
        },
        [pendingConsent, launch, accountId]
    );

    const store = useCallback(
        (next: MiniAppLink[]): boolean => {
            if (!cloudId || !writeLinks(cloudId, next)) return false;
            setStored({ cloudId, links: next });
            return true;
        },
        [cloudId]
    );

    const saveLink = useCallback(
        (name: string, url: string): MiniAppLinkSave => {
            if (!cloudId || !isOwner || editing === null) return 'failed';
            const problem = checkMiniAppLink(name, url);
            if (problem) return problem;
            const saved = { name: name.trim(), url: url.trim() };
            let next: MiniAppLink[];
            if (editing === 'new') {
                if (links.length >= MINI_APP_LINK_LIMIT) return 'full';
                next = [...links, { id: newLinkId(), ...saved }];
            } else {
                next = links.map(link => (link.id === editing.id ? { ...link, ...saved } : link));
            }
            return store(next) ? 'saved' : 'failed';
        },
        [cloudId, isOwner, editing, links, store]
    );

    const removeLink = useCallback((): boolean => {
        if (!isOwner || editing === null || editing === 'new') return false;
        return store(links.filter(link => link.id !== editing.id));
    }, [isOwner, editing, links, store]);

    return {
        available: cloudId !== null,
        isOwner,
        links,
        canAdd,
        openHub: () => openPage(null),
        pendingConsentHost: pendingConsent ? hostOf(pendingConsent) : null,
        answerConsent,
        editing: isOwner ? editing : null,
        setEditing,
        saveLink,
        removeLink,
    };
};
