import { useCallback, useEffect, useRef, useState } from 'react';

import type { AppMessageData } from '@chatic/bridge-messages';
import { runtime } from '@chatic/app-runtime';
import {
    buildMiniAppLaunchParams,
    isOpenableSubWebViewUrl,
    subWebViewTrustOf,
    type SubWebViewTrust,
} from '@chatic/shared';

import { openSubWebView, type SubWebViewOpening } from '../../../bridge/subWebView';
import { miniAppHubUrl } from '../../../bridge/subWebViewApps';
import { useOnSubWebViewClosed } from '../../../bridge/useHandleAppMessage';
import { useActiveCloudPlaces, useInvitedClouds, useMyProfile } from '../../../hooks';
import { useCloudSessionCatalog } from '../../../hooks/useCloudCatalog';
import { deviceMedium } from '../../../storage';
import { isDevBuild } from '../../../utils/buildEnv';
import { cloudDisplayName } from '../../../utils/cloudDisplayName';

/**
 * Where a cloud's mini app link and the per-site consent are kept: the device medium, under the keys
 * the desktop web uses too. Device-only on purpose — the link has no server field yet, so only the
 * owner who saved it sees it, on this phone. The medium tolerates a full or blocked storage (a read
 * answers `null`, a write is dropped), so a write is read back to know whether it held.
 */
const linkKey = (cloudId: string) => `dou.miniAppLink.${cloudId}`;
// Per account as well as per host: on a shared device one person's yes must not send another's names.
const consentKey = (accountId: string, host: string) => `dou.miniAppConsent.${accountId}.${host}`;

const readLink = (cloudId: string): string | null => {
    const stored = deviceMedium.get(linkKey(cloudId));
    // A stored value the shell would no longer open is no link at all.
    return stored && isOpenableSubWebViewUrl(stored) ? stored : null;
};

/** Save (`url`) or remove (`null`) the link for `cloudId`; `false` when the medium did not keep it. */
const writeLink = (cloudId: string, url: string | null): boolean => {
    const key = linkKey(cloudId);
    if (url === null) deviceMedium.remove(key);
    else deviceMedium.set(key, url);
    return deviceMedium.get(key) === url;
};

const hasConsent = (accountId: string | null | undefined, host: string): boolean =>
    !!accountId && deviceMedium.get(consentKey(accountId, host)) === '1';

// A medium that drops it is not an error: the page still opens this time, and the question comes back.
const writeConsent = (accountId: string | null | undefined, host: string): void => {
    if (accountId) deviceMedium.set(consentKey(accountId, host), '1');
};

/** What the hub hands back to send an owner to the link setting. */
const OPEN_LINK_SETTINGS = 'openMiniAppLinkSettings';

const asksForLinkSettings = (result: unknown): boolean =>
    !!result && typeof result === 'object' && (result as { action?: unknown }).action === OPEN_LINK_SETTINGS;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The session's name for me, or `null` for its stand-ins: the runtime's `Unknown` and a guest's UUID. */
const realName = (name: string): string | null => {
    const trimmed = name.trim();
    return trimmed && trimmed !== 'Unknown' && !UUID.test(trimmed) ? trimmed : null;
};

const hostOf = (url: string): string => new URL(url).host;

export type MiniAppLinkSave = 'saved' | 'invalid' | 'failed';

/** How an open ended, for the card to tell the user. */
export type MiniAppOpenOutcome = 'opened' | 'outside' | 'failed';

/**
 * The Lab's mini app: the active cloud's link, opening it (or the hub) with who is looking, the
 * first-open consent for a site DoU does not run, and the hub's way back to the link setting. The
 * same shape as the desktop web's, so the two webs treat a link the same way.
 *
 * - `available` is false on the Default Cloud (Home): it is the relay's, with no owner and no link.
 * - Only the cloud's owner gets `isOwner`, and only the hub is told it; the link setting is theirs.
 * - The link is per cloud, so switching clouds shows that cloud's link, never the previous one's.
 * - One open at a time: a second press while the first request is out sends nothing.
 * - The hub's result reaches the setting only for the view this card opened on the hub — a site that
 *   closes with the same result does nothing.
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

    const [link, setLink] = useState<string | null>(null);
    const [isLinkSettingsOpen, setLinkSettingsOpen] = useState(false);
    // Another cloud: its own link, and no sheet left open (or asked for) by the previous one.
    useEffect(() => {
        setLink(cloudId ? readLink(cloudId) : null);
        setLinkSettingsOpen(false);
    }, [cloudId]);

    const opening = useRef(false);
    const [pendingConsent, setPendingConsent] = useState<string | null>(null);
    const openedHub = useRef<string | null>(null);
    const onOpenedRef = useRef(onOpened);
    onOpenedRef.current = onOpened;

    useOnSubWebViewClosed(
        useCallback((message: AppMessageData<'OnSubWebViewClosed'>) => {
            const closed = message.data;
            if (!closed || closed.viewId !== openedHub.current) return;
            openedHub.current = null;
            if (asksForLinkSettings(closed.result)) setLinkSettingsOpen(true);
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
                },
                trust
            );
            try {
                const opened: SubWebViewOpening = await openSubWebView({ url, params });
                // Set on the reply. The shell answers as it adds the view, before the page has loaded,
                // so the hub cannot close and hand its result back before this runs.
                openedHub.current = opened.via === 'subWebView' && trust === 'firstParty' ? opened.viewId : null;
                // The card is drawn only where the shell opens any https site, so the OS-browser
                // fallback of an older app is not reached — but it carries no params, so it is said.
                onOpenedRef.current?.(opened.via === 'subWebView' ? 'opened' : 'outside');
            } catch {
                onOpenedRef.current?.('failed');
            } finally {
                opening.current = false;
            }
        },
        [cloudId, uid, cloudName, place, placeNick, profileName, isOwner]
    );

    const open = useCallback(() => {
        const url = link ?? miniAppHubUrl(isDevBuild() ? 'dev' : 'prod');
        const trust = subWebViewTrustOf(url);
        // Unreachable while the stored link and the hub pass the same rule the shell opens by.
        if (!trust) return;
        // A site DoU does not run is told the user's names only once the user has agreed to it, per host.
        if (trust === 'external' && !hasConsent(accountId, hostOf(url))) {
            setPendingConsent(url);
            return;
        }
        void launch(url, trust);
    }, [link, launch, accountId]);

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

    /** Save the owner's link, or remove it with an empty value. Checked by the rule the shell opens by. */
    const saveLink = useCallback(
        (value: string): MiniAppLinkSave => {
            if (!cloudId || !isOwner) return 'failed';
            const url = value.trim() || null;
            if (url !== null && !isOpenableSubWebViewUrl(url)) return 'invalid';
            if (!writeLink(cloudId, url)) return 'failed';
            setLink(url);
            return 'saved';
        },
        [cloudId, isOwner]
    );

    return {
        available: cloudId !== null,
        isOwner,
        link,
        open,
        /** The host waiting for the user's consent, or `null`. */
        pendingConsentHost: pendingConsent ? hostOf(pendingConsent) : null,
        answerConsent,
        isLinkSettingsOpen: isOwner && isLinkSettingsOpen,
        setLinkSettingsOpen,
        saveLink,
    };
};
