import { useCallback, useEffect, useRef, useState } from 'react';

import type { AppMessageData } from '@chatic/bridge-messages';
import { runtime } from '@chatic/app-runtime';
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
import { useOnSubWebViewClosed } from '../../../bridge/useHandleAppMessage';
import { useActiveCloudPlaces, useInvitedClouds, useMyProfile } from '../../../hooks';
import { useCloudSessionCatalog } from '../../../hooks/useCloudCatalog';
import { deviceStore } from '../../../storage';
import { isDevBuild } from '../../../utils/buildEnv';
import { cloudDisplayName } from '../../../utils/cloudDisplayName';

/**
 * Where a cloud's mini apps and the per-site consent are kept: the device store, under the keys the
 * desktop web uses too. Device-only on purpose — the links have no server field yet, so only the
 * owner who saved them sees them, on this phone. The store tolerates a full or blocked storage (a read
 * answers `null`, a write is dropped), so a write is read back to know whether it held.
 */
const linksKey = (cloudId: string) => `dou.miniAppLinks.${cloudId}`;
// Per account as well as per host: on a shared device one person's yes must not send another's names.
const consentKey = (accountId: string, host: string) => `dou.miniAppConsent.${accountId}.${host}`;

/** The mini apps saved for `cloudId`, in the owner's order — without any the shell would no longer open. */
const readLinks = (cloudId: string | null): MiniAppLink[] =>
    cloudId ? parseMiniAppLinks(deviceStore.get(linksKey(cloudId))) : [];

/** Save the whole list for `cloudId`; an empty list removes the key. `false` when the store did not keep it. */
const writeLinks = (cloudId: string, links: readonly MiniAppLink[]): boolean => {
    const key = linksKey(cloudId);
    const value = links.length === 0 ? null : JSON.stringify(links);
    if (value === null) deviceStore.remove(key);
    else deviceStore.set(key, value);
    return deviceStore.get(key) === value;
};

/**
 * Not `crypto.randomUUID`: it exists only in a secure context, and a real device loads the dev server
 * over plain http from a LAN address. `getRandomValues` has no such limit.
 */
const newLinkId = (): string =>
    Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');

const hasConsent = (accountId: string | null | undefined, host: string): boolean =>
    !!accountId && deviceStore.get(consentKey(accountId, host)) === '1';

// A store that drops it is not an error: the page still opens this time, and the question comes back.
const writeConsent = (accountId: string | null | undefined, host: string): void => {
    if (accountId) deviceStore.set(consentKey(accountId, host), '1');
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

export type MiniAppLinkSave = 'saved' | MiniAppLinkProblem | 'full' | 'failed';

/** The mini app the owner's sheet edits: one already saved, or `'new'` for one being added. */
export type MiniAppLinkEditing = MiniAppLink | 'new';

/** How an open ended, for the card to tell the user. */
export type MiniAppOpenOutcome = 'opened' | 'outside' | 'failed';

/**
 * The Lab's mini apps: opening the hub with who is looking and the cloud's list, opening the mini app
 * the hub hands back (behind the first-open consent for a site DoU does not run), and the owner's list.
 * The same shape as the desktop web's, so the two webs treat a list the same way.
 *
 * - `available` is false on the Default Cloud (Home): it is the relay's, with no owner and no list.
 * - Only the cloud's owner adds, edits and removes; only the hub is told `isOwner` and the list.
 * - The hub's "open this one" result is looked up in the list by id, so the hub only ever names a mini
 *   app the list holds, and never hands DoU an address to open.
 * - The list is per cloud, so switching clouds shows that cloud's list, never the previous one's.
 * - One open at a time: a second press while the first request is out sends nothing.
 * - The hub's result counts only for the view this card opened on the hub, and only while the same
 *   cloud is open — a site that closes with the same result does nothing.
 */
export const useMiniAppLauncher = ({ onOpened }: { onOpened?: (outcome: MiniAppOpenOutcome) => void } = {}) => {
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const cloudId = selectedCloudId && selectedCloudId !== 'default' ? selectedCloudId : null;
    const { clouds } = useCloudSessionCatalog();
    const ownedCloud = clouds.find(cloud => cloud.id === cloudId);
    // Owner only on positive evidence: the cloud is in the account's owned catalog. "Not in the invited
    // list" is not enough — that list starts empty on every mount and fills in later, and a cloud in
    // neither list (a paired one) is not mine either — so the owner's controls and `isOwner` fail closed
    // until the catalog says so, as the desktop's `kind === 'owned'` does.
    const isOwner = !!ownedCloud;
    const { invitedClouds } = useInvitedClouds();
    const invitedCloud = invitedClouds.find(cloud => cloud.id === cloudId);
    const cloudName = ownedCloud ? cloudDisplayName(ownedCloud) : (invitedCloud?.name ?? '');
    const { places } = useActiveCloudPlaces();
    const place = places.find(candidate => candidate.id === selectedSiteId);
    // My id in THIS cloud, never another's: a page must not get one cloud's uid labelled as this one's.
    const uid = runtime.session.useUidInCloud(cloudId ?? '');
    const { userId: accountId } = runtime.session.useSessionIdentity();
    const placeNick = useMyProfile().profile?.nick;
    const profileName = realName(runtime.session.useRuntimeProfile().userName);

    // The list is read while rendering, not in an effect: an effect leaves one commit where the rows
    // are the previous cloud's while `cloudId` is already the new one, and a press in that commit would
    // open the old cloud's page with the new cloud's params.
    const [stored, setStored] = useState(() => ({ cloudId, links: readLinks(cloudId) }));
    const [editing, setEditing] = useState<MiniAppLinkEditing | null>(null);
    const [pendingConsent, setPendingConsent] = useState<string | null>(null);
    if (stored.cloudId !== cloudId) {
        // Another cloud: its own list, and no sheet or consent question left open by the previous one —
        // agreeing to the old cloud's site would hand it this cloud's names.
        setStored({ cloudId, links: readLinks(cloudId) });
        setEditing(null);
        setPendingConsent(null);
    }
    const links = stored.cloudId === cloudId ? stored.links : readLinks(cloudId);
    const canAdd = isOwner && links.length < MINI_APP_LINK_LIMIT;

    const opening = useRef(false);
    // The hub view this card opened, and the cloud it was opened in.
    const openedHub = useRef<{ viewId: string; cloudId: string } | null>(null);
    const onOpenedRef = useRef(onOpened);
    onOpenedRef.current = onOpened;
    // The hub is answered with what holds when it closes, read through a ref rather than subscribing
    // again on every change.
    const answerHub = useRef<(hubCloudId: string, request: HubRequest) => void>(() => undefined);

    useOnSubWebViewClosed(
        useCallback((message: AppMessageData<'OnSubWebViewClosed'>) => {
            const closed = message.data;
            const hub = openedHub.current;
            if (!closed || closed.viewId !== hub?.viewId) return;
            openedHub.current = null;
            answerHub.current(hub.cloudId, hubRequestOf(closed.result));
        }, [])
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
                    miniApps: links,
                },
                trust
            );
            try {
                const opened: SubWebViewOpening = await openSubWebView({ url, params });
                // Set on the reply. The shell answers as it adds the view, before the page has loaded,
                // so the hub cannot close and hand its result back before this runs.
                openedHub.current =
                    opened.via === 'subWebView' && trust === 'firstParty' ? { viewId: opened.viewId, cloudId } : null;
                // The card is drawn only where the shell opens any https site, so the OS-browser
                // fallback of an older app is not reached — but it carries no params, so it is said.
                onOpenedRef.current?.(opened.via === 'subWebView' ? 'opened' : 'outside');
            } catch {
                onOpenedRef.current?.('failed');
            } finally {
                opening.current = false;
            }
        },
        [cloudId, uid, cloudName, place, placeNick, profileName, isOwner, links]
    );

    /** Open `link`, or the hub for `null`. */
    const openPage = useCallback(
        (link: MiniAppLink | null) => {
            const url = link?.url ?? miniAppHubUrl(isDevBuild() ? 'dev' : 'prod');
            const trust = subWebViewTrustOf(url);
            // Unreachable while the stored links and the hub pass the same rule the shell opens by.
            if (!trust) return;
            // A site DoU does not run is told the user's names only once the user has agreed to it, per host.
            if (trust === 'external' && !hasConsent(accountId, hostOf(url))) {
                setPendingConsent(url);
                return;
            }
            void launch(url, trust);
        },
        [launch, accountId]
    );

    // Set after each commit, never while rendering: a render React throws away must not leave its own
    // cloud and list behind for the hub's answer.
    useEffect(() => {
        answerHub.current = (hubCloudId, request) => {
            // A hub that closes after a cloud switch answers for a cloud no longer open: nothing happens.
            if (!request || hubCloudId !== cloudId) return;
            // Adding is the owner's alone: a hub that closes before the catalog named me the owner opens nothing.
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
                next = [...links, { id: newLinkId(), ...saved }];
            } else {
                next = links.map(link => (link.id === editing.id ? { ...link, ...saved } : link));
            }
            return store(next) ? 'saved' : 'failed';
        },
        [cloudId, isOwner, editing, links, store]
    );

    /** Remove the mini app being edited. `false` when the store did not keep the change. */
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
        pendingConsentHost: pendingConsent ? hostOf(pendingConsent) : null,
        answerConsent,
        /** What the owner's sheet edits, or `null` while it is closed. */
        editing: isOwner ? editing : null,
        setEditing,
        saveLink,
        removeLink,
    };
};
