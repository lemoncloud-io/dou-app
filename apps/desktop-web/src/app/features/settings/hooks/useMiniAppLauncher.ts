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

const miniAppHubUrl = (): string =>
    String(import.meta.env.VITE_ENV ?? '').toUpperCase() === 'PROD'
        ? 'https://apps.chatic.io/'
        : 'https://apps-dev.chatic.io/';

export const openableMiniAppUrl = (stored: string | undefined): string | null => {
    const url = stored?.trim();
    if (!url) return null;
    return checkMiniAppUrl(url) ? null : url;
};

const asksForLinkSettings = (result: unknown): boolean =>
    !!result && typeof result === 'object' && (result as { action?: unknown }).action === 'openMiniAppLinkSettings';

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

export const isPreProductionBuild = (): boolean => {
    const stage = String(import.meta.env.VITE_ENV ?? '').toUpperCase();
    return stage === 'LOCAL' || stage === 'DEV';
};

export type MiniAppUrlSave = 'saved' | MiniAppUrlProblem | 'failed';

export const useMiniAppLauncher = () => {
    const { t } = useTranslation();
    const { clouds, activeCloudId } = useClouds();
    const cloudId = activeCloudId && activeCloudId !== 'default' ? activeCloudId : null;
    const cloud = clouds.find(c => c.id === cloudId);
    const isOwner = cloud?.kind === 'owned';
    const { placeId, placeName } = useCurrentPlace();
    const uid = runtime.session.useUidInCloud(cloudId ?? '');
    const { userId: accountId } = runtime.session.useSessionIdentity();
    const placeNick = viewerPlaceProfile({ uid: accountId, name: '', cloudUid: uid }, useSiteProfileMap())?.nick;
    const profileName = useAccountName();
    const { url, freshUrl, save } = useCloudMiniApp(cloudId);

    const [editSeed, setEditSeed] = useState<string | null>(null);
    const [pendingConsent, setPendingConsent] = useState<string | null>(null);
    const [shownCloudId, setShownCloudId] = useState(cloudId);
    if (shownCloudId !== cloudId) {
        setShownCloudId(cloudId);
        setEditSeed(null);
        setPendingConsent(null);
    }

    const activeCloud = useRef(cloudId);
    useEffect(() => {
        activeCloud.current = cloudId;
    }, [cloudId]);
    const opening = useRef(false);

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
                openedHub.current = trust === 'firstParty' ? { viewId, cloudId } : null;
            } catch (error) {
                logger.warn('BRIDGE', 'mini app did not open', { error });
                toastFailure(t('settings.miniApp.openFailed'), error);
            }
        },
        [cloudId, uid, cloud?.name, placeId, placeName, placeNick, profileName, isOwner, t]
    );

    const openPage = useCallback(
        async (pageUrl: string | null) => {
            const target = pageUrl ?? miniAppHubUrl();
            const trust = subWebViewTrustOf(target);
            if (!trust) {
                logger.warn('BRIDGE', 'mini app link refused by the trust rule', { url: target });
                return;
            }
            if (trust === 'external' && !hasMiniAppConsent(accountId, new URL(target).host)) {
                setPendingConsent(target);
                return;
            }
            await launch(target, trust);
        },
        [launch, accountId]
    );

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

    const saveUrl = useCallback(
        async (input: string): Promise<MiniAppUrlSave> => {
            if (!cloudId || !isOwner) return 'failed';
            const next = input.trim();
            const problem = next ? checkMiniAppUrl(next) : null;
            if (problem) return problem;
            try {
                const stored = await save(cloudId, next);
                if (stored !== next) {
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
        url,
        linkHost: (() => {
            const page = openableMiniAppUrl(url);
            return page ? new URL(page).host : null;
        })(),
        open,
        pendingConsentHost: pendingConsent ? new URL(pendingConsent).host : null,
        answerConsent,
        editSeed: isOwner ? editSeed : null,
        editLink,
        closeEditing: () => setEditSeed(null),
        saveUrl,
    };
};
