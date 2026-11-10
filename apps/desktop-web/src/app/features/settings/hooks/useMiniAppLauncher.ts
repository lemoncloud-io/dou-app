import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SubWebViewOpenScope } from '@chatic/bridge-messages';
import type { MiniAppLink, MiniAppLinkProblem, SubWebViewTrust } from '@chatic/shared';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { buildMiniAppLaunchParams, checkMiniAppLink, MINI_APP_LINK_LIMIT, subWebViewTrustOf } from '@chatic/shared';

import {
    toastFailure,
    useAccountName,
    useClouds,
    useCurrentPlace,
    useSiteProfileMap,
    viewerPlaceProfile,
} from '../../../shared';
import { hasMiniAppConsent, readMiniAppLinks, writeMiniAppConsent, writeMiniAppLinks } from '../utils/miniAppStorage';
import { onShellSubWebViewClosed, openShellSubWebView, readSubWebViewOpenScope } from '../utils/subWebViewShell';

/** The active cloud's saved mini apps; none outside a cloud. */
const linksOf = (cloudId: string | null): MiniAppLink[] => (cloudId ? readMiniAppLinks(cloudId) : []);

/**
 * DoU's own hub, the way into a cloud's mini apps: it greets the user, lists the cloud's mini apps and
 * points an owner to adding one.
 */
const miniAppHubUrl = (): string =>
    String(import.meta.env.VITE_ENV ?? '').toUpperCase() === 'PROD'
        ? 'https://apps.chatic.io/'
        : 'https://apps-dev.chatic.io/';

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

/** How far the shell opens sub views, once its handshake answers; `null` until then and outside a shell. */
export const useSubWebViewOpenScope = (): SubWebViewOpenScope | null => {
    const [scope, setScope] = useState<SubWebViewOpenScope | null>(null);
    useEffect(() => {
        let live = true;
        void readSubWebViewOpenScope().then(next => {
            if (live) setScope(next);
        });
        return () => {
            live = false;
        };
    }, []);
    return scope;
};

export type MiniAppLinkSave = 'saved' | MiniAppLinkProblem | 'full' | 'failed';

/** The mini app the owner's dialog edits: one already saved, or `'new'` for one being added. */
export type MiniAppLinkEditing = MiniAppLink | 'new';

/**
 * The settings' mini apps: opening the hub with who is looking and the cloud's list, opening the mini
 * app the hub hands back (behind the first-open consent for a site DoU does not run), and the owner's
 * list.
 *
 * - `available` is false in the Default Cloud (Home): it is the relay's, with no owner and no list.
 * - Only the cloud's owner adds, edits and removes; the hub's "add one" result reaches the owner alone.
 * - The hub's "open this one" result is looked up in the list by id, so the hub only ever names a mini
 *   app the list holds, and never hands DoU an address to open.
 * - The list is per cloud, so switching clouds shows that cloud's list, never the previous one's.
 * - One open at a time: a second press while the first request is out sends nothing.
 */
export const useMiniAppLauncher = () => {
    const { t } = useTranslation();
    const { clouds, activeCloudId } = useClouds();
    const cloudId = activeCloudId && activeCloudId !== 'default' ? activeCloudId : null;
    const cloud = clouds.find(c => c.id === cloudId);
    const isOwner = cloud?.kind === 'owned';
    const { placeId, placeName } = useCurrentPlace();
    // My id in THIS cloud, never the committed session's: during a switch that is another cloud's uid,
    // and a page must not get it labelled as this cloud's.
    const uid = runtime.session.useUidInCloud(cloudId ?? '');
    const { userId: accountId } = runtime.session.useSessionIdentity();
    const placeNick = viewerPlaceProfile({ uid: accountId, name: '', cloudUid: uid }, useSiteProfileMap())?.nick;
    const profileName = useAccountName();

    // The list is read while rendering, not in an effect: an effect leaves one commit where the rows
    // are the previous cloud's while `cloudId` is already the new one, and a press in that commit would
    // open the old cloud's page with the new cloud's params.
    const [stored, setStored] = useState(() => ({ cloudId, links: linksOf(cloudId) }));
    const [editing, setEditing] = useState<MiniAppLinkEditing | null>(null);
    if (stored.cloudId !== cloudId) {
        // Another cloud: its own list, and no dialog left open (or asked for) by the previous one.
        setStored({ cloudId, links: linksOf(cloudId) });
        setEditing(null);
    }
    const links = stored.cloudId === cloudId ? stored.links : linksOf(cloudId);
    const canAdd = isOwner && links.length < MINI_APP_LINK_LIMIT;

    const opening = useRef(false);
    const [pendingConsent, setPendingConsent] = useState<string | null>(null);

    // The hub's result counts only for the view this screen opened on the hub. It is answered with the
    // list as it is when the hub closes, so the handler reads it through a ref rather than subscribing
    // again on every change.
    const openedHub = useRef<string | null>(null);
    const answerHub = useRef<(request: HubRequest) => void>(() => undefined);
    useEffect(
        () =>
            onShellSubWebViewClosed(closed => {
                if (closed.viewId !== openedHub.current) return;
                openedHub.current = null;
                answerHub.current(hubRequestOf(closed.result));
            }),
        []
    );

    const launch = useCallback(
        async (url: string, trust: SubWebViewTrust) => {
            if (!cloudId || opening.current) return;
            if (!uid) {
                // The session has not named me in this cloud yet: say so rather than do nothing.
                logger.warn('BRIDGE', 'mini app not opened: no uid in this cloud', { cloudId });
                toastFailure(t('settings.miniApp.openFailed'), null);
                return;
            }
            opening.current = true;
            const params = buildMiniAppLaunchParams(
                {
                    cloud: { id: cloudId, name: cloud?.name ?? '' },
                    place: placeId ? { id: placeId, name: placeName } : null,
                    user: { id: uid, placeNick, profileName },
                    isOwner,
                    miniApps: links,
                },
                trust
            );
            try {
                const viewId = await openShellSubWebView(url, params);
                // Set on the reply. The shell answers as it adds the view, before the page has loaded,
                // so the hub cannot close and hand its result back before this runs.
                openedHub.current = trust === 'firstParty' ? viewId : null;
            } catch (error) {
                logger.warn('BRIDGE', 'mini app did not open', { error });
                toastFailure(t('settings.miniApp.openFailed'), error);
            } finally {
                opening.current = false;
            }
        },
        [cloudId, uid, cloud?.name, placeId, placeName, placeNick, profileName, isOwner, links, t]
    );

    /** Open `link`, or the hub for `null`. */
    const openPage = useCallback(
        (link: MiniAppLink | null) => {
            const url = link?.url ?? miniAppHubUrl();
            const trust = subWebViewTrustOf(url);
            if (!trust) {
                // Unreachable while the stored links and the hub pass the same rule; logged in case they drift.
                logger.warn('BRIDGE', 'mini app link refused by the trust rule', { url });
                return;
            }
            // A site DoU does not run is told the user's names only once the user has agreed to it, per host.
            if (trust === 'external' && !hasMiniAppConsent(accountId, new URL(url).host)) {
                setPendingConsent(url);
                return;
            }
            void launch(url, trust);
        },
        [launch, accountId]
    );

    useEffect(() => {
        answerHub.current = request => {
            if (request?.kind === 'linkSettings') {
                // `editing` is shown to the owner alone (below), so a member's hub asking for it opens nothing.
                setEditing('new');
                return;
            }
            if (request?.kind === 'open') {
                const link = links.find(candidate => candidate.id === request.id);
                if (link) openPage(link);
                else logger.warn('BRIDGE', 'hub asked for a mini app this cloud does not list', { cloudId });
            }
        };
    }, [links, openPage, cloudId]);

    const answerConsent = useCallback(
        (agreed: boolean) => {
            const url = pendingConsent;
            setPendingConsent(null);
            if (!agreed || !url) return;
            writeMiniAppConsent(accountId, new URL(url).host);
            void launch(url, 'external');
        },
        [pendingConsent, launch, accountId]
    );

    const store = useCallback(
        (next: MiniAppLink[]): boolean => {
            if (!cloudId || !writeMiniAppLinks(cloudId, next)) return false;
            setStored({ cloudId, links: next });
            return true;
        },
        [cloudId]
    );

    /**
     * Save the mini app being edited — a new one goes to the end of the list. Checked by the rule the
     * shell opens by, so a saved link is never one it would refuse.
     */
    const saveLink = useCallback(
        (name: string, url: string): MiniAppLinkSave => {
            if (!cloudId || !isOwner || editing === null) return 'failed';
            const problem = checkMiniAppLink(name, url);
            if (problem) return problem;
            const saved = { name: name.trim(), url: url.trim() };
            let next: MiniAppLink[];
            if (editing === 'new') {
                if (links.length >= MINI_APP_LINK_LIMIT) return 'full';
                next = [...links, { id: crypto.randomUUID(), ...saved }];
            } else {
                next = links.map(link => (link.id === editing.id ? { ...link, ...saved } : link));
            }
            return store(next) ? 'saved' : 'failed';
        },
        [cloudId, isOwner, editing, links, store]
    );

    /** Remove the mini app being edited. `false` when the storage refused. */
    const removeLink = useCallback((): boolean => {
        if (!isOwner || editing === null || editing === 'new') return false;
        return store(links.filter(link => link.id !== editing.id));
    }, [isOwner, editing, links, store]);

    return {
        available: cloudId !== null,
        isOwner,
        links,
        canAdd,
        /** Open the hub, which lists this cloud's mini apps. */
        openHub: () => openPage(null),
        /** The host waiting for the user's consent, or `null`. */
        pendingConsentHost: pendingConsent ? new URL(pendingConsent).host : null,
        answerConsent,
        /** What the owner's dialog edits, or `null` while it is closed. */
        editing: isOwner ? editing : null,
        setEditing,
        saveLink,
        removeLink,
    };
};
