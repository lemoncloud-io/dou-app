import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SubWebViewOpenScope } from '@chatic/bridge-messages';
import type { MiniAppUrlProblem, SubWebViewTrust } from '@chatic/shared';

import { runtime } from '@chatic/runtime';
import { logger } from '@chatic/bridges';
import { buildMiniAppLaunchParams, checkMiniAppUrl, subWebViewTrustOf } from '@chatic/shared';

import {
    toastFailure,
    useAccountName,
    useClouds,
    useCurrentPlace,
    useSiteProfileMap,
    viewerPlaceProfile,
} from '../../../shared';
import { hasMiniAppConsent, writeMiniAppConsent } from '../utils/miniAppStorage';
import { onShellSubWebViewClosed, openShellSubWebView, readSubWebViewOpenScope } from '../utils/subWebViewShell';
import { useCloudMiniApp } from './useCloudMiniApp';

/**
 * DoU's own hub: it greets the user and, for an owner, points to setting the cloud's link. It opens
 * when the cloud has no link the shell would open.
 */
const miniAppHubUrl = (): string =>
    String(import.meta.env.VITE_ENV ?? '').toUpperCase() === 'PROD'
        ? 'https://apps.chatic.io/'
        : 'https://apps-dev.chatic.io/';

/**
 * The stored link as an address the shell would open, or `null`. The relay keeps whatever string the
 * owner sent, so a link is checked again here, by the rule the shell opens by, before it is used.
 */
export const openableMiniAppUrl = (stored: string | undefined): string | null => {
    const url = stored?.trim();
    if (!url) return null;
    return checkMiniAppUrl(url) ? null : url;
};

/** What the hub hands back when it closes: send the owner to setting the link. Anything else is no request. */
const asksForLinkSettings = (result: unknown): boolean =>
    !!result && typeof result === 'object' && (result as { action?: unknown }).action === 'openMiniAppLinkSettings';

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

/**
 * Mini apps are not released to production yet, so they show on LOCAL and DEV builds only. The raw
 * build value is read, not the config registry: a build that lost its stage must hide them like
 * production does, not show them like a developer's machine.
 */
export const isPreProductionBuild = (): boolean => {
    const stage = String(import.meta.env.VITE_ENV ?? '').toUpperCase();
    return stage === 'LOCAL' || stage === 'DEV';
};

export type MiniAppUrlSave = 'saved' | MiniAppUrlProblem | 'failed';

/**
 * A cloud's mini app: its one link, kept on the relay, opened in the shell's sub view — or the hub
 * when there is none — behind the first-open consent for a site DoU does not run; and the owner's
 * editing of the link.
 *
 * - `available` is false in the Default Cloud (Home): it is the relay's, with no owner and no link.
 * - Only the cloud's owner sets and clears the link; the hub's "set one" result reaches the owner alone.
 * - Opening reads the link from the relay on every press, never from the cache: the owner may have
 *   replaced it from another device. A cloud switch while that read is out opens nothing.
 * - Switching clouds drops what the previous cloud left waiting: its edit dialog, its consent, its
 *   hub's result.
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
    const { url, freshUrl, save } = useCloudMiniApp(cloudId);

    // The link the owner's dialog starts from, read fresh as it opened; `null` while it is closed.
    const [editSeed, setEditSeed] = useState<string | null>(null);
    const [pendingConsent, setPendingConsent] = useState<string | null>(null);
    const [shownCloudId, setShownCloudId] = useState(cloudId);
    if (shownCloudId !== cloudId) {
        // Another cloud: no dialog left open by the previous one, and no consent still waiting —
        // agreeing to it now would send this cloud's names to the previous cloud's site.
        setShownCloudId(cloudId);
        setEditSeed(null);
        setPendingConsent(null);
    }

    const activeCloud = useRef(cloudId);
    useEffect(() => {
        activeCloud.current = cloudId;
    }, [cloudId]);
    const opening = useRef(false);

    // The hub's result counts only for the view this screen opened on the hub, and only while the cloud
    // it was opened for is still the active one.
    const openedHub = useRef<{ viewId: string; cloudId: string } | null>(null);
    const answerHub = useRef<(asksForSettings: boolean, hubCloudId: string) => void>(() => undefined);
    useEffect(
        () =>
            onShellSubWebViewClosed(closed => {
                const opened = openedHub.current;
                if (closed.viewId !== opened?.viewId) return;
                openedHub.current = null;
                answerHub.current(asksForLinkSettings(closed.result), opened.cloudId);
            }),
        []
    );

    const launch = useCallback(
        async (pageUrl: string, trust: SubWebViewTrust) => {
            if (!cloudId) return;
            if (!uid) {
                // The session has not named me in this cloud yet: say so rather than do nothing.
                logger.warn('BRIDGE', 'mini app not opened: no uid in this cloud', { cloudId });
                toastFailure(t('settings.miniApp.openFailed'), null);
                return;
            }
            try {
                const params = buildMiniAppLaunchParams(
                    {
                        cloud: { id: cloudId, name: cloud?.name ?? '' },
                        place: placeId ? { id: placeId, name: placeName } : null,
                        user: { id: uid, placeNick, profileName },
                        isOwner,
                    },
                    trust
                );
                const viewId = await openShellSubWebView(pageUrl, params);
                // Set on the reply. The shell answers as it adds the view, before the page has loaded,
                // so the hub cannot close and hand its result back before this runs.
                openedHub.current = trust === 'firstParty' ? { viewId, cloudId } : null;
            } catch (error) {
                logger.warn('BRIDGE', 'mini app did not open', { error });
                toastFailure(t('settings.miniApp.openFailed'), error);
            }
        },
        [cloudId, uid, cloud?.name, placeId, placeName, placeNick, profileName, isOwner, t]
    );

    /** Open `pageUrl`, or the hub for `null`. */
    const openPage = useCallback(
        async (pageUrl: string | null) => {
            const target = pageUrl ?? miniAppHubUrl();
            const trust = subWebViewTrustOf(target);
            if (!trust) {
                // Unreachable while the link and the hub pass the same rule; logged in case they drift.
                logger.warn('BRIDGE', 'mini app link refused by the trust rule', { url: target });
                return;
            }
            // A site DoU does not run is told the user's names only once the user has agreed to it, per host.
            if (trust === 'external' && !hasMiniAppConsent(accountId, new URL(target).host)) {
                setPendingConsent(target);
                return;
            }
            await launch(target, trust);
        },
        [launch, accountId]
    );

    /** Open the cloud's link, or the hub when it has none the shell would open. */
    const open = useCallback(async () => {
        if (!cloudId || opening.current) return;
        opening.current = true;
        try {
            let stored: string;
            try {
                stored = await freshUrl(cloudId);
            } catch (error) {
                logger.warn('BRIDGE', 'mini app link not read', { cloudId, error });
                toastFailure(t('settings.miniApp.openFailed'), error);
                return;
            }
            if (activeCloud.current !== cloudId) return;
            const page = openableMiniAppUrl(stored);
            if (stored.trim() && !page) {
                logger.warn('BRIDGE', 'stored mini app link is not one the shell opens', { cloudId });
            }
            await openPage(page);
        } finally {
            opening.current = false;
        }
    }, [cloudId, freshUrl, openPage, t]);

    /**
     * Open the owner's link dialog on what the relay holds now. Read fresh, not from the cache: a dialog
     * seeded from a read that failed or has not landed would show "no link" and let the owner overwrite
     * one they cannot see. A failed read opens nothing and says so.
     */
    const editLink = useCallback(async () => {
        if (!cloudId || !isOwner) return;
        let stored: string;
        try {
            stored = await freshUrl(cloudId);
        } catch (error) {
            logger.warn('BRIDGE', 'mini app link not read for editing', { cloudId, error });
            toastFailure(t('settings.miniApp.linkReadFailed'), error);
            return;
        }
        if (activeCloud.current !== cloudId) return;
        setEditSeed(stored);
    }, [cloudId, isOwner, freshUrl, t]);

    useEffect(() => {
        answerHub.current = (asksForSettings, hubCloudId) => {
            if (hubCloudId !== cloudId) {
                logger.warn('BRIDGE', 'hub result ignored: the cloud changed while it was open', { cloudId });
                return;
            }
            // Checked here, not only where the dialog is drawn: a member's request left in state would
            // pop the dialog up later, the moment the catalog named them the owner.
            if (asksForSettings && isOwner) void editLink();
        };
    }, [cloudId, isOwner, editLink]);

    const answerConsent = useCallback(
        (agreed: boolean) => {
            const target = pendingConsent;
            setPendingConsent(null);
            if (!agreed || !target) return;
            if (opening.current) {
                logger.warn('BRIDGE', 'mini app consent answered while another open is out; nothing opened', {
                    cloudId,
                });
                return;
            }
            writeMiniAppConsent(accountId, new URL(target).host);
            opening.current = true;
            void launch(target, 'external').finally(() => {
                opening.current = false;
            });
        },
        [pendingConsent, launch, accountId, cloudId]
    );

    /**
     * Save the link as typed — empty clears it. Checked by the rule the shell opens by first, since the
     * relay stores any string.
     */
    const saveUrl = useCallback(
        async (input: string): Promise<MiniAppUrlSave> => {
            if (!cloudId || !isOwner) return 'failed';
            const next = input.trim();
            const problem = next ? checkMiniAppUrl(next) : null;
            if (problem) return problem;
            try {
                const stored = await save(cloudId, next);
                if (stored !== next) {
                    // The relay kept something else than what was sent: not what the owner saved.
                    logger.warn('BRIDGE', 'mini app link stored differs from the one sent', { cloudId });
                    return 'failed';
                }
                return 'saved';
            } catch (error) {
                logger.warn('BRIDGE', 'mini app link not saved', { cloudId, error });
                return 'failed';
            }
        },
        [cloudId, isOwner, save]
    );

    return {
        available: cloudId !== null,
        isOwner,
        /** The link as the relay holds it (`''` for none), or `undefined` until it is read. */
        url,
        /** The link's host when it is one the shell would open, else `null` — the hub opens instead. */
        linkHost: (() => {
            const page = openableMiniAppUrl(url);
            return page ? new URL(page).host : null;
        })(),
        open,
        /** The host waiting for the user's consent, or `null`. */
        pendingConsentHost: pendingConsent ? new URL(pendingConsent).host : null,
        answerConsent,
        /** The link the owner's dialog edits, or `null` while it is closed. */
        editSeed: isOwner ? editSeed : null,
        editLink,
        closeEditing: () => setEditSeed(null),
        saveUrl,
    };
};
