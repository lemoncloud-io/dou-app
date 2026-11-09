import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { SubWebViewOpenScope } from '@chatic/bridge-messages';
import type { SubWebViewTrust } from '@chatic/shared';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { buildMiniAppLaunchParams, isOpenableSubWebViewUrl, subWebViewTrustOf } from '@chatic/shared';

import { toastFailure, useAccountName, useClouds, useCurrentPlace, useSiteProfileMap } from '../../../shared';
import { hasMiniAppConsent, readMiniAppLink, writeMiniAppConsent, writeMiniAppLink } from '../utils/miniAppStorage';
import { onShellSubWebViewClosed, openShellSubWebView, readSubWebViewOpenScope } from '../utils/subWebViewShell';

/** DoU's own hub, opened when the cloud has no link: it greets the user and points an owner to the link. */
export const miniAppHubUrl = (): string =>
    String(import.meta.env.VITE_ENV ?? '').toUpperCase() === 'PROD'
        ? 'https://apps.chatic.io/'
        : 'https://apps-dev.chatic.io/';

/** What the hub hands back to send an owner to the link setting. */
const OPEN_LINK_SETTINGS = 'openMiniAppLinkSettings';

const asksForLinkSettings = (result: unknown): boolean =>
    !!result && typeof result === 'object' && (result as { action?: unknown }).action === OPEN_LINK_SETTINGS;

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

export type MiniAppLinkSave = 'saved' | 'invalid' | 'failed';

/**
 * The settings' mini app: the active cloud's link, opening it (or the hub) with who is looking, the
 * first-open consent for a site DoU does not run, and the hub's way back to the link setting.
 *
 * - `available` is false in the Default Cloud (Home): it is the relay's, with no owner and no link.
 * - Only the cloud's owner reads `isOwner`: the link setting is theirs, and so is the hub's result.
 * - The link is per cloud, so switching clouds shows that cloud's link, never the previous one's.
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
    const placeNick = useSiteProfileMap()[uid ?? '']?.nick;
    const profileName = useAccountName();

    const [link, setLink] = useState<string | null>(null);
    const [isLinkSettingsOpen, setLinkSettingsOpen] = useState(false);
    // Another cloud: its own link, and no dialog left open (or asked for) by the previous one.
    useEffect(() => {
        setLink(cloudId ? readMiniAppLink(cloudId) : null);
        setLinkSettingsOpen(false);
    }, [cloudId]);

    const opening = useRef(false);
    const [pendingConsent, setPendingConsent] = useState<string | null>(null);

    // The hub's result reaches the setting only for the view this screen opened on the hub; the setting
    // itself opens for the owner alone (`isLinkSettingsOpen` below).
    const openedHub = useRef<string | null>(null);
    useEffect(
        () =>
            onShellSubWebViewClosed(closed => {
                if (closed.viewId !== openedHub.current) return;
                openedHub.current = null;
                if (asksForLinkSettings(closed.result)) setLinkSettingsOpen(true);
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
        [cloudId, uid, cloud?.name, placeId, placeName, placeNick, profileName, isOwner, t]
    );

    const open = useCallback(() => {
        const url = link ?? miniAppHubUrl();
        const trust = subWebViewTrustOf(url);
        if (!trust) {
            // Unreachable while the stored link and the hub pass the same rule; logged in case they drift.
            logger.warn('BRIDGE', 'mini app link refused by the trust rule', { url });
            return;
        }
        // A site DoU does not run is told the user's names only once the user has agreed to it, per host.
        if (trust === 'external' && !hasMiniAppConsent(new URL(url).host)) {
            setPendingConsent(url);
            return;
        }
        void launch(url, trust);
    }, [link, launch]);

    const answerConsent = useCallback(
        (agreed: boolean) => {
            const url = pendingConsent;
            setPendingConsent(null);
            if (!agreed || !url) return;
            writeMiniAppConsent(new URL(url).host);
            void launch(url, 'external');
        },
        [pendingConsent, launch]
    );

    /** Save the owner's link, or remove it with an empty value. Checked by the rule the shell opens by. */
    const saveLink = useCallback(
        (value: string): MiniAppLinkSave => {
            if (!cloudId || !isOwner) return 'failed';
            const url = value.trim() || null;
            if (url !== null && !isOpenableSubWebViewUrl(url)) return 'invalid';
            if (!writeMiniAppLink(cloudId, url)) return 'failed';
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
        pendingConsentHost: pendingConsent ? new URL(pendingConsent).host : null,
        answerConsent,
        isLinkSettingsOpen: isOwner && isLinkSettingsOpen,
        setLinkSettingsOpen,
        saveLink,
    };
};
