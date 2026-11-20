import { useCallback, useEffect, useRef, useState } from 'react';

import { runtime, type DomainMiniApp } from '@chatic/runtime';
import { buildMiniAppLaunchParams, subWebViewTrustOf, type SubWebViewTrust } from '@chatic/shared';

import { openSubWebView, type SubWebViewOpening } from '../../../bridge/subWebView';
import { miniAppHubUrl } from '../../../bridge/subWebViewApps';
import { useActiveCloudPlaces, useMyProfile } from '../../../hooks';
import { deviceStore } from '../../../storage';
import { isDevBuild } from '../../../utils/buildEnv';

/**
 * The first-open consent, per account and per host — the Lab card's key, so a site agreed to there is
 * not asked about again here. Per account as well: on a shared device one person's yes must not send
 * another's names.
 */
export const miniAppConsentKey = (accountId: string, host: string) => `dou.miniAppConsent.${accountId}.${host}`;

const hasConsent = (accountId: string | null | undefined, host: string): boolean =>
    !!accountId && deviceStore.get(miniAppConsentKey(accountId, host)) === '1';

// A store that drops it is not an error: the page still opens this time, and the question comes back.
const writeConsent = (accountId: string | null | undefined, host: string): void => {
    if (accountId) deviceStore.set(miniAppConsentKey(accountId, host), '1');
};

/**
 * What the hub hands back when it closes: send the owner to adding a mini app, or open the one with
 * this id. Anything else is no request.
 */
type HubRequest = { kind: 'linkSettings' } | { kind: 'open'; id: string } | null;

const hubRequestOf = (result: unknown): HubRequest => {
    if (!result || typeof result !== 'object') return null;
    const { action, id } = result as { action?: unknown; id?: unknown };
    if (action === 'openMiniAppLinkSettings') return { kind: 'linkSettings' };
    if (action === 'openMiniApp' && typeof id === 'string') return { kind: 'open', id };
    return null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The session's name for me, or `null` for its stand-ins: the runtime's `Unknown` and a guest's UUID. */
const realName = (name: string): string | null => {
    const trimmed = name.trim();
    return trimmed && trimmed !== 'Unknown' && !UUID.test(trimmed) ? trimmed : null;
};

const hostOf = (url: string): string => new URL(url).host;

/** How an open ended, for the screen to tell the user. */
export type MiniAppOpenOutcome = 'opened' | 'outside' | 'failed';

/** The mini app waiting for the first-open consent: its name for the question, its address to open. */
export interface PendingConsent {
    name: string;
    url: string;
}

interface Options {
    cloudId: string | null;
    cloudName: string;
    isOwner: boolean;
    /** The cloud's active mini apps: all the hub is handed, and all it may name back. */
    active: readonly DomainMiniApp[];
    onOpened?: (outcome: MiniAppOpenOutcome) => void;
    /** The hub asked the owner to add a mini app. Called only for the owner. */
    onAddRequested?: () => void;
}

/**
 * Opening the hub and the cloud's mini apps — the same rules as the Lab card's launcher, kept here on
 * their own so that card, which a production build still shows, is not touched.
 *
 * - The trust tier is the shell's rule (`subWebViewTrustOf`); a site DoU does not run is told the
 *   user's names only once the user has agreed to it, per host.
 * - The hub is handed the active mini apps only, and its "open this one" result is looked up among
 *   them by id, so it never hands DoU an address to open, nor one an owner turned off.
 * - One open at a time: a second press while the first request is out sends nothing.
 * - The hub's result counts only for the view this screen opened on it, and only while the same
 *   cloud is open. Switching clouds drops a consent question still waiting.
 */
export const useMiniAppOpener = ({ cloudId, cloudName, isOwner, active, onOpened, onAddRequested }: Options) => {
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const { places } = useActiveCloudPlaces();
    const place = places.find(candidate => candidate.id === selectedSiteId);
    // My id in THIS cloud, never another's: a page must not get one cloud's uid labelled as this one's.
    const uid = runtime.session.useUidInCloud(cloudId ?? '');
    const { userId: accountId } = runtime.session.useSessionIdentity();
    const placeNick = useMyProfile().profile?.nick;
    const profileName = realName(runtime.session.useRuntimeProfile().userName);

    // Reset while rendering, not in an effect: an effect leaves one commit in which the previous
    // cloud's question is still up, and agreeing in it would hand that site this cloud's names.
    const [pending, setPending] = useState<{ cloudId: string | null; consent: PendingConsent | null }>({
        cloudId,
        consent: null,
    });
    if (pending.cloudId !== cloudId) setPending({ cloudId, consent: null });
    const pendingConsent = pending.cloudId === cloudId ? pending.consent : null;

    const opening = useRef(false);
    // The hub view this screen opened, and the cloud it was opened in.
    const openedHub = useRef<{ viewId: string; cloudId: string } | null>(null);
    const onOpenedRef = useRef(onOpened);
    onOpenedRef.current = onOpened;
    // The hub is answered with what holds when it closes, read through a ref rather than subscribing
    // again on every change.
    const answerHub = useRef<(hubCloudId: string, request: HubRequest) => void>(() => undefined);

    // A host with no sub web view opens the hub in a tab instead, which never reports a close: nothing to hear.
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
                // The session has not named me in this cloud yet: say so rather than do nothing.
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
                // Set on the reply. The shell answers as it adds the view, before the page has loaded,
                // so the hub cannot close and hand its result back before this runs.
                openedHub.current =
                    opened.via === 'subWebView' && trust === 'firstParty' ? { viewId: opened.viewId, cloudId } : null;
                // An older app opens the page in the OS browser, without params: said, not hidden.
                onOpenedRef.current?.(opened.via === 'subWebView' ? 'opened' : 'outside');
            } catch {
                onOpenedRef.current?.('failed');
            } finally {
                opening.current = false;
            }
        },
        [cloudId, uid, cloudName, place, placeNick, profileName, isOwner, active]
    );

    /** Open `app`, or the hub for `null`. */
    const open = useCallback(
        (app: DomainMiniApp | null) => {
            const url = app?.url ?? miniAppHubUrl(isDevBuild() ? 'dev' : 'prod');
            const trust = subWebViewTrustOf(url);
            // The relay checks an address by the same rule the shell opens by; one that fails it is not opened.
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

    // Set after each commit, never while rendering: a render React throws away must not leave its own
    // cloud and list behind for the hub's answer.
    const onAddRequestedRef = useRef(onAddRequested);
    onAddRequestedRef.current = onAddRequested;
    useEffect(() => {
        answerHub.current = (hubCloudId, request) => {
            // A hub that closes after a cloud switch answers for a cloud no longer open: nothing happens.
            if (!request || hubCloudId !== cloudId) return;
            // Adding is the owner's alone: a hub that closes before the catalog named me the owner opens nothing.
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
        /** Open the hub, which lists this cloud's active mini apps. */
        openHub: () => open(null),
        open,
        /** The mini app waiting for the user's consent, or `null`. */
        pendingConsent,
        answerConsent,
    };
};
