import { useCallback, useEffect, useRef, useState } from 'react';

import { runtime, type DomainMiniApp } from '@chatic/runtime';
import { buildMiniAppLaunchParams, subWebViewTrustOf, type SubWebViewTrust } from '@chatic/shared';

import { openSubWebView, type SubWebViewOpening } from '../../../bridge/subWebView';
import { miniAppHubUrl } from '../../../bridge/subWebViewApps';
import { useActiveCloudPlaces, useMyProfile } from '../../../hooks';
import { deviceStore } from '../../../storage';
import { isDevBuild } from '../../../utils/buildEnv';

export const miniAppConsentKey = (accountId: string, host: string) => `dou.miniAppConsent.${accountId}.${host}`;

const hasConsent = (accountId: string | null | undefined, host: string): boolean =>
    !!accountId && deviceStore.get(miniAppConsentKey(accountId, host)) === '1';

const writeConsent = (accountId: string | null | undefined, host: string): void => {
    if (accountId) deviceStore.set(miniAppConsentKey(accountId, host), '1');
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

export type MiniAppOpenOutcome = 'opened' | 'outside' | 'failed';

export interface PendingConsent {
    name: string;
    url: string;
}

interface Options {
    cloudId: string | null;
    cloudName: string;
    isOwner: boolean;
    active: readonly DomainMiniApp[];
    onOpened?: (outcome: MiniAppOpenOutcome) => void;
    onAddRequested?: () => void;
}

export const useMiniAppOpener = ({ cloudId, cloudName, isOwner, active, onOpened, onAddRequested }: Options) => {
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const { places } = useActiveCloudPlaces();
    const place = places.find(candidate => candidate.id === selectedSiteId);
    const uid = runtime.session.useUidInCloud(cloudId ?? '');
    const { userId: accountId } = runtime.session.useSessionIdentity();
    const placeNick = useMyProfile().profile?.nick;
    const profileName = realName(runtime.session.useRuntimeProfile().userName);

    const [pending, setPending] = useState<{ cloudId: string | null; consent: PendingConsent | null }>({
        cloudId,
        consent: null,
    });
    if (pending.cloudId !== cloudId) setPending({ cloudId, consent: null });
    const pendingConsent = pending.cloudId === cloudId ? pending.consent : null;

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
                    miniApps: active.map(({ id, name, url: link }) => ({ id, name, url: link })),
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
        [cloudId, uid, cloudName, place, placeNick, profileName, isOwner, active]
    );

    const open = useCallback(
        (app: DomainMiniApp | null) => {
            const url = app?.url ?? miniAppHubUrl(isDevBuild() ? 'dev' : 'prod');
            const trust = subWebViewTrustOf(url);
            if (!trust) {
                onOpenedRef.current?.('failed');
                return;
            }
            if (trust === 'external' && app && !hasConsent(accountId, hostOf(url))) {
                setPending({ cloudId, consent: { name: app.name, url } });
                return;
            }
            void launch(url, trust);
        },
        [launch, accountId, cloudId]
    );

    const onAddRequestedRef = useRef(onAddRequested);
    onAddRequestedRef.current = onAddRequested;
    useEffect(() => {
        answerHub.current = (hubCloudId, request) => {
            if (!request || hubCloudId !== cloudId) return;
            if (request.kind === 'linkSettings') {
                if (isOwner) onAddRequestedRef.current?.();
                return;
            }
            const app = active.find(candidate => candidate.id === request.id);
            if (app) open(app);
        };
    }, [cloudId, isOwner, active, open]);

    const answerConsent = useCallback(
        (agreed: boolean) => {
            const consent = pendingConsent;
            setPending({ cloudId, consent: null });
            if (!agreed || !consent) return;
            writeConsent(accountId, hostOf(consent.url));
            void launch(consent.url, 'external');
        },
        [pendingConsent, launch, accountId, cloudId]
    );

    return {
        openHub: () => open(null),
        open,
        pendingConsent,
        answerConsent,
    };
};
