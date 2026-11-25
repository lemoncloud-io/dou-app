import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { runtime, RELAY_ORIGIN_CID } from '@chatic/runtime-react';
import { logger } from '@chatic/bridges';
import { readSubWebViewLinkPath, subWebViewPageUrlOfNavigatePath } from '@chatic/shared';
import { useToast } from '@chatic/ui-kit/components/ui/use-toast';

import { ROUTES } from '../../routes/paths';

import { useLogoutCloudSession } from '../../runtime/useLogoutCloudSession';
import { useSiteSwitch } from '../../runtime/useSiteSwitch';
import { useStackNavigate } from '../../navigation';
import { pushRoomPlace } from './pushRoomPlace';
import { resolvePushNavigation } from './resolvePushNavigation';
import { resolveThreadTarget } from './resolveThreadTarget';
import { channelIdOfRoomPath, roomOpenTrace } from '../../runtime/perf';
import { shellCapabilities } from '../shellCapabilities';
import { openSubWebViewTarget } from '../subWebViewLink';

const HANDSHAKE_WAIT_TIMEOUT_MS = 10_000;

const ROOM_ROW_READ_TIMEOUT_MS = 1_000;

const readRoomRow = <T>(read: () => Promise<T | null>): Promise<T | null> =>
    new Promise(resolve => {
        const timer = setTimeout(() => resolve(null), ROOM_ROW_READ_TIMEOUT_MS);
        Promise.resolve()
            .then(read)
            .then(
                row => resolve(row ?? null),
                () => resolve(null)
            )
            .finally(() => clearTimeout(timer));
    });

const toLocationKey = (target: string): string => target.split('#')[0];

const isChannelRoomPath = (pathname: string): boolean => /^\/channels\/[^/]+\/room$/.test(pathname);

export const usePushNavigate = (): ((rawPath: string) => Promise<void>) => {
    const navigate = useNavigate();
    const enterStack = useStackNavigate();
    const { t } = useTranslation();
    const { toast } = useToast();
    const { selectedCloudId, selectedSiteId } = runtime.session.useSessionSelection();
    const { activeServer } = runtime.session.useGlobalSession();
    const { switchCloud } = runtime.session.useSwitchCloudSession();
    const { logoutCloudSession } = useLogoutCloudSession();
    const { switchSite } = useSiteSwitch();
    const { chat: chatRepository, channel: channelRepository } = runtime.data.useRuntimeRepositories();
    const inFlightRef = useRef(false);

    const navigateNormalized = useCallback((target: string) => enterStack('push', toLocationKey(target)), [enterStack]);

    const hopToThread = useCallback(
        async (chatId: string) => {
            try {
                if (!isChannelRoomPath(window.location.pathname)) return;
                const cached = await chatRepository.cacheRead(chatId);
                const target = resolveThreadTarget(cached ?? (await chatRepository.getChat({ id: chatId })), chatId);
                if (!target || !isChannelRoomPath(window.location.pathname)) return;
                logger.info('ROUTER', `Push points at a thread reply; opening thread: ${target}`);
                navigate(target);
            } catch (error) {
                logger.info('ROUTER', 'Could not resolve a thread for the pushed chat; staying in the room', {
                    data: { chatId },
                    error,
                });
            }
        },
        [chatRepository, navigate]
    );

    return useCallback(
        async (rawPath: string) => {
            const link = readSubWebViewLinkPath(rawPath);
            const handedPageUrl = link ? null : subWebViewPageUrlOfNavigatePath(rawPath);
            const subWebViewTarget = link ? { link } : handedPageUrl ? { pageUrl: handedPageUrl } : null;
            if (subWebViewTarget) {
                if (!shellCapabilities.supports('OpenSubWebView')) {
                    logger.warn('router.sub_webview_link_unsupported', 'This app cannot show a sub WebView page', {
                        appId: link?.appId,
                    });
                    return;
                }
                await openSubWebViewTarget(subWebViewTarget);
                return;
            }

            if (inFlightRef.current) {
                logger.info('ROUTER', `Push navigation already in flight; dropping: ${rawPath}`);
                return;
            }
            inFlightRef.current = true;

            const { target, cid, sid: pushSid, chatId } = resolvePushNavigation(rawPath);

            const isRelayPush = cid === RELAY_ORIGIN_CID;
            const needsRelayReturn = isRelayPush && activeServer.kind === 'cloud';
            const needsCloudSwitch = !!cid && !isRelayPush && cid !== selectedCloudId;

            const roomChannelId = channelIdOfRoomPath(target);
            const cachedRoom =
                roomChannelId && !needsCloudSwitch && !needsRelayReturn
                    ? await readRoomRow(() => channelRepository.cacheRead(roomChannelId))
                    : null;
            const sid = pushRoomPlace(roomChannelId, pushSid, cachedRoom);
            logger.info('ROUTER', `Push navigation requested: ${rawPath}`, { target, cid, sid, pushSid, chatId });
            const needsSiteSwitch = !!sid && sid !== selectedSiteId;
            const needsSwitch = needsRelayReturn || needsCloudSwitch || needsSiteSwitch;
            const isCloudMainPush = needsCloudSwitch && target === ROUTES.root;
            let cloudSwitched = false;

            const land = async () => {
                navigateNormalized(target);
                if (chatId) await hopToThread(chatId);
            };

            if (needsSwitch) {
                roomOpenTrace.putAttribute(
                    roomChannelId,
                    'switch',
                    needsRelayReturn ? 'relay' : needsCloudSwitch ? 'cloud' : 'site'
                );
            }

            try {
                if (needsSwitch) {
                    const verified = await runtime.connection.waitUntilVerified(null, HANDSHAKE_WAIT_TIMEOUT_MS);
                    if (!verified && isCloudMainPush) {
                        logger.warn('ROUTER', 'Socket not verified for a cloud-ready push; staying put', { cid });
                        toast({ title: t('cloudSessionSheet.switchFailed'), variant: 'destructive' });
                        return;
                    }
                    if (!verified) {
                        logger.warn('ROUTER', 'Socket handshake not verified before switch; navigating best-effort', {
                            target,
                            cid,
                            sid,
                        });
                        await land();
                        return;
                    }
                    roomOpenTrace.mark(roomChannelId, 'handshake_done');
                    if (cid && !isRelayPush && runtime.push.notifications) {
                        await runtime.data.recoverInvitedCloudIfMissing(cid);
                        roomOpenTrace.mark(roomChannelId, 'recover_done');
                    }
                    if (needsRelayReturn) await logoutCloudSession();
                    if (cid && needsCloudSwitch) {
                        await switchCloud(cid);
                        cloudSwitched = true;
                    }
                    if (needsRelayReturn || needsCloudSwitch) roomOpenTrace.mark(roomChannelId, 'cloud_done');
                    if (sid && needsSiteSwitch) await switchSite(sid);
                    roomOpenTrace.mark(roomChannelId, 'switch_done');
                }
                await land();
            } catch (error) {
                logger.error('ROUTER', `Failed to navigate to: ${target}`, { error });
                if (isCloudMainPush && !cloudSwitched) {
                    toast({ title: t('cloudSessionSheet.switchFailed'), variant: 'destructive' });
                    return;
                }
                await land();
            } finally {
                inFlightRef.current = false;
            }
        },
        [
            navigateNormalized,
            hopToThread,
            selectedCloudId,
            selectedSiteId,
            activeServer.kind,
            switchCloud,
            logoutCloudSession,
            switchSite,
            channelRepository,
            toast,
            t,
        ]
    );
};
