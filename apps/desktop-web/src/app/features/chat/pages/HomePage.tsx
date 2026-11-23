import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime, RELAY_CLOUD_ID } from '@chatic/runtime';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { selectNewAccountPending, useJoinDialogStore, useSignInNoticeStore } from '../../auth';
import {
    ChannelSettingsPanel,
    CreateChannelDialog,
    NewDmDialog,
    SendInviteDialog,
    InviteWaitingDialog,
    PlaceInviteLinkDialog,
    useChannelMembers,
    useChannelSettingsStore,
    useCreateChannelDialogStore,
    useSendInviteStore,
} from '../../channels';
import { DebugPanel } from '../../debug';
import { EditPlaceProfileDialog, useEditPlaceProfileDialogStore } from '../../profile';
import { MiniAppRailButton } from '../../settings/components/MiniAppRailButton';
import {
    ProfilePanel,
    lastChatNoOf,
    useChannels,
    useDebugModeStore,
    useCloudPushBadgeStore,
    canCreatePlace,
    readPlaceManageAccess,
    useClouds,
    useCloudSwitchFlow,
    useMessageJumpStore,
    useOpenAtBottomStore,
    usePendingOpenStore,
    usePlaces,
    useProfilePanelStore,
    useSavedPageStore,
    useMyThreadsStore,
    isThreadUnread,
    isThreadInScope,
    useMentionsStore,
    inboxPlaceScope,
    isInInboxScope,
    useNavStore,
    useReadCursorStore,
    useSelectPlace,
    useDeletePlace,
    useKnownChannelsStore,
    useLastChannelStore,
    useSelectedChannelStore,
    useSiteProfiles,
    useStartDm,
    channelKind,
    channelRef,
    isSelfChannel,
    useChannelLabels,
    type MessageJumpOrigin,
    type NavDestination,
    useUnreadStore,
    useCloudProfiles,
    useComposerFocusStore,
} from '../../../shared';
import {
    ChannelList,
    ChatPane,
    CloudSwitcher,
    CreatePlaceDialog,
    DesktopLayout,
    EditPlaceDialog,
    ForwardFileHost,
    OnboardingDialog,
    NavRail,
    NavSidebar,
    PlaceRail,
    SidebarHeader,
    SavedPage,
    ThreadsPage,
    NotificationsPanel,
    ChannelListPanel,
    DmListPanel,
    type SelectConversation,
    ThreadPanel,
    WelcomePage,
} from '../components';
import {
    useHydrateDmPeers,
    useHeldChannel,
    useNextUnreadShortcut,
    useChannelHistory,
    useHistoryPress,
    usePendingLanding,
    useRailShortcuts,
    usePlaceWelcome,
    useTrailingPanelOwners,
} from '../hooks';
import {
    elsewhereChannels as elsewhereChannelRows,
    hasUnreadDm,
    hasUnreadRoom,
    landingTarget,
    openPlaceFor,
    pendingOpenRoute,
    pendingRedirectPlace,
} from '../utils';
import {
    type HistoryDirection,
    useChannelHistoryStore,
    useCreatePlaceDialogStore,
    useEditPlaceDialogStore,
    useThreadStore,
} from '../stores';
import {
    openLandingOf,
    opensIntoKnownCloud,
    originFor,
    placeToEnter,
    returnRoute,
    sameRoom,
    shouldOfferReturn,
    type ReaderLocation,
} from '../utils';

const isWindowActive = (): boolean =>
    typeof document === 'undefined' || (document.visibilityState === 'visible' && document.hasFocus());

const HANDSHAKE_WAIT_TIMEOUT_MS = 10_000;

const switchAfterHandshake = async (doSwitch: () => void): Promise<void> => {
    await runtime.connection.waitUntilVerified(null, HANDSHAKE_WAIT_TIMEOUT_MS);
    doSwitch();
};

const NAV_ITEMS: NavDestination[] = ['home', 'notifications', 'channels', 'dm'];

const NAV_PANEL_WIDTH = { storageKey: 'chatic.navPanel.width', defaultWidth: 420 };

export const HomePage = () => {
    const { clouds, activeCloudId, isCloudsError, isFetchingClouds, refetchClouds } = useClouds();
    const { places, placeIds, isLoading: placesLoading } = usePlaces();
    const newAccountPending = useSignInNoticeStore(selectNewAccountPending);
    const unreadByPlace = useUnreadStore(s => s.byPlace);
    const badgedClouds = useCloudPushBadgeStore(s => s.badged);

    const isDefaultMode = (activeCloudId ?? 'default') === 'default';
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const selectedPlaceId = isDefaultMode ? 'default' : selectedSiteId;

    const { switchPlace, enterPlace, isSwitching: isPlaceSwitching } = useSelectPlace();
    const { switchCloud, isSwitching: isCloudSwitching } = useCloudSwitchFlow();
    const isSwitching = isPlaceSwitching || isCloudSwitching;
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const railLocked = isSwitching || !isVerified;

    const skipComposerFocus = useComposerFocusStore(s => s.skipNext);
    useEffect(() => {
        if (!skipComposerFocus) return;
        const timer = setTimeout(() => useComposerFocusStore.getState().clearSkip(), isSwitching ? 15000 : 3000);
        return () => clearTimeout(timer);
    }, [isSwitching, skipComposerFocus]);

    useSiteProfiles();

    const hasNoPlace = !isDefaultMode && !placesLoading && !isSwitching && places.length === 0;
    const listedPlaceId = hasNoPlace ? undefined : (selectedSiteId ?? undefined);
    const { channels, isLoading, filedPlaces, memberPeers } = useChannels(listedPlaceId, {
        whenNoPlace: isDefaultMode ? 'relay' : hasNoPlace ? 'cloudDms' : 'nothing',
    });
    const selectedChannelId = useSelectedChannelStore(s => s.selectedChannelId);
    const selectChannel = useSelectedChannelStore(s => s.selectChannel);
    const requestMessageJump = useMessageJumpStore(s => s.request);
    const setJumpOrigin = useMessageJumpStore(s => s.setOrigin);
    const openCreateChannel = useCreateChannelDialogStore(s => s.open);
    const setCreatePlaceOpen = useCreatePlaceDialogStore(s => s.setOpen);
    const { isGuest, isCloudActive } = runtime.session.useRuntimeProfile();
    const mayManagePlaces = readPlaceManageAccess();
    const mayManagePlacesHere = canCreatePlace(clouds, activeCloudId, {
        isGuest,
        isCloudActive,
        canManage: mayManagePlaces,
    });
    useEffect(() => setCreatePlaceOpen(false), [activeCloudId, setCreatePlaceOpen]);
    const openEditPlace = useEditPlaceDialogStore(s => s.open);
    const { deletePlace } = useDeletePlace();
    const [isNewDmOpen, setIsNewDmOpen] = useState(false);
    const { isAvailable: canStartDm, startDm, isStarting } = useStartDm();
    const [startingPeerId, setStartingPeerId] = useState<string | null>(null);
    const openEditPlaceProfile = useEditPlaceProfileDialogStore(s => s.open);
    const threadChannel = useHeldChannel(
        channels.find(channel => channel.id === selectedChannelId),
        selectedChannelId,
        isLoading
    );
    const {
        threadRootId: openThreadRootId,
        settingsChannelId,
        profileTarget,
        savedOpen,
    } = useTrailingPanelOwners(threadChannel?.id, isLoading);
    const closeSettings = useChannelSettingsStore(s => s.close);
    const openThread = useThreadStore(s => s.open);
    const closeThread = useThreadStore(s => s.close);
    const closeProfile = useProfilePanelStore(s => s.close);
    const closeSaved = useSavedPageStore(s => s.close);
    const openSaved = useSavedPageStore(s => s.open);
    const [roomOpenedHere, setRoomOpenedHere] = useState(false);
    const navActive = useNavStore(s => s.active);
    const inboxScope = useMemo(
        () => inboxPlaceScope({ isDefaultMode, selectedPlaceId, placeIds }),
        [isDefaultMode, selectedPlaceId, placeIds]
    );
    const mainPage = useSavedPageStore(s => s.page);
    const scopeCloudId = activeCloudId ?? RELAY_CLOUD_ID;
    const hasUnreadThreads = useMyThreadsStore(s =>
        Object.values(s.threads).some(
            thread => isThreadUnread(thread) && isThreadInScope(thread, scopeCloudId, inboxScope)
        )
    );
    const hasInboxUnread = useMentionsStore(s =>
        Object.values(s.items).some(item => !item.readAt && isInInboxScope(item, scopeCloudId, inboxScope))
    );
    const hasChannelUnread = hasUnreadRoom(channels);
    const hasDmUnread = hasUnreadDm(channels);
    const debugEnabled = useDebugModeStore(s => s.enabled);
    const debugPanelOpen = useDebugModeStore(s => s.overlayOpen);
    const showDebugPanel = (import.meta.env.DEV || debugEnabled) && debugPanelOpen;
    const myUid = runtime.session.useSessionIdentity().userId;

    const [query, setQuery] = useState('');
    const {
        pendingChannelRef,
        pendingPlaceRef,
        awaitedPlaceRef,
        pendingJumpRef,
        pendingOpenAtBottomRef,
        pendingThreadRef,
        armPendingExpiry,
        abandonPending,
    } = usePendingLanding();
    const pendingNamedPlaceRef = useRef('');
    const redirectedPendingRef = useRef<string | null>(null);
    const requestOpenAtBottom = useOpenAtBottomStore(s => s.request);

    const openThreadNowOrDefer = (channelId: string, rootId: string) => {
        if (channelId !== selectedChannelId) {
            pendingThreadRef.current = { channelId, rootId };
            return;
        }
        pendingThreadRef.current = null;
        openThread(rootId, channelId);
    };

    const switchPlaceForOpen = (placeId: string) => {
        if (switchPlace(placeId, abandonPending)) {
            awaitedPlaceRef.current = placeId;
        } else if (isPlaceSwitching) {
            abandonPending();
        } else {
            awaitedPlaceRef.current = null;
        }
    };
    const isPlaceBound = (channelId: string) =>
        channels.some(channel => channel.id === channelId && isSelfChannel(channel));

    const here: ReaderLocation = {
        cloudId: activeCloudId ?? 'default',
        placeId: selectedPlaceId ?? null,
        channelId: selectedChannelId,
    };
    const labelOf = useChannelLabels(channels);
    const openChannel = channels.find(channel => channel.id === selectedChannelId);
    const channelHistory = useChannelHistory({
        here,
        label: openChannel ? channelRef(channelKind(openChannel), labelOf(openChannel)) : null,
        threadRootId: openThreadRootId ?? null,
        isLanding: () => pendingChannelRef.current !== null,
    });
    const isReachable = (entry: MessageJumpOrigin) =>
        entry.cloudId !== here.cloudId || entry.placeId !== here.placeId || listedChannelIds.has(entry.channelId);
    const recordOrigin = (targetChannelId: string) => {
        const current = channels.find(channel => channel.id === selectedChannelId);
        setJumpOrigin(
            current
                ? originFor(here, targetChannelId, {
                      label: channelRef(channelKind(current), labelOf(current)),
                      position: useMessageJumpStore.getState().position,
                      threadRootId: openThreadRootId ?? null,
                  })
                : null
        );
    };

    const jumpToSaved = (channelId: string, chatNo?: number, requestedPlaceId?: string, threadRootId?: string) => {
        if (isSwitching) return;
        closeSaved();
        setRoomOpenedHere(true);
        recordOrigin(channelId);
        const placeId = openPlaceFor(
            { placeId: requestedPlaceId ?? '', channelId, placeBound: isPlaceBound(channelId) },
            { placeId: selectedPlaceId, filedPlaces }
        );
        if (placeId && placeId !== selectedPlaceId) {
            pendingChannelRef.current = channelId;
            pendingNamedPlaceRef.current = '';
            pendingThreadRef.current = threadRootId ? { channelId, rootId: threadRootId } : null;
            pendingJumpRef.current = !threadRootId && chatNo != null ? { channelId, chatNo } : null;
            armPendingExpiry();
            switchPlaceForOpen(placeId);
            return;
        }
        selectChannel(channelId);
        if (threadRootId) {
            openThreadNowOrDefer(channelId, threadRootId);
            return;
        }
        if (chatNo != null) requestMessageJump(channelId, chatNo);
    };

    const pendingOpen = usePendingOpenStore(s => s.target);
    const clearPendingOpen = usePendingOpenStore(s => s.clear);
    const { t: translate } = useTranslation();
    useEffect(() => {
        if (!pendingOpen?.channelId) return;
        const { cloudId, channelId } = pendingOpen;
        const landing = openLandingOf(pendingOpen);
        const activeCloud = activeCloudId ?? 'default';
        if (
            !opensIntoKnownCloud(pendingOpen, {
                activeCloudId: activeCloud,
                knownCloudIds: new Set(clouds.map(c => c.id)),
            })
        ) {
            if (isFetchingClouds) return;
            toast({ description: translate('chat.file.linkUnavailable') });
            clearPendingOpen();
            return;
        }
        const sameCloud = !cloudId || cloudId === activeCloud;
        recordOrigin(channelId);
        pendingThreadRef.current = landing.kind === 'thread' ? { channelId, rootId: landing.rootId } : null;
        pendingOpenAtBottomRef.current = landing.kind === 'latest' ? channelId : null;
        pendingJumpRef.current = landing.kind === 'message' ? { channelId, chatNo: landing.chatNo } : null;
        pendingNamedPlaceRef.current = pendingOpen.placeId;
        if (sameCloud && isLoading) {
            pendingChannelRef.current = channelId;
            armPendingExpiry();
            clearPendingOpen();
            return;
        }
        const placeId = sameCloud
            ? openPlaceFor(
                  { ...pendingOpen, placeBound: isPlaceBound(channelId) },
                  { placeId: selectedPlaceId, filedPlaces }
              )
            : pendingOpen.placeId;
        const route = pendingOpenRoute(
            { ...pendingOpen, placeId },
            {
                cloudId: activeCloud,
                placeId: selectedPlaceId,
                listedIds: new Set(channels.map(channel => channel.id ?? '')),
            }
        );
        if (route === 'switch-cloud' && cloudId) {
            pendingChannelRef.current = channelId;
            pendingPlaceRef.current = placeId || null;
            armPendingExpiry();
            void switchAfterHandshake(() => switchCloud(cloudId));
        } else if (route === 'switch-place') {
            pendingChannelRef.current = channelId;
            armPendingExpiry();
            awaitedPlaceRef.current = placeId;
            void switchAfterHandshake(() => switchPlaceForOpen(placeId));
        } else if (route === 'wait') {
            pendingChannelRef.current = channelId;
            armPendingExpiry();
        } else {
            closeSaved();
            setRoomOpenedHere(true);
            selectChannel(channelId);
            if (landing.kind === 'thread') openThreadNowOrDefer(channelId, landing.rootId);
            else if (landing.kind === 'message') {
                pendingJumpRef.current = null;
                requestMessageJump(channelId, landing.chatNo);
            } else {
                requestOpenAtBottom(channelId);
                pendingOpenAtBottomRef.current = null;
            }
        }
        clearPendingOpen();
    }, [pendingOpen?.nonce, isFetchingClouds]);

    const autoEnteredRef = useRef(new Set<string>());
    useEffect(() => {
        autoEnteredRef.current.clear();
    }, [isVerified, activeCloudId, myUid]);

    useEffect(() => {
        if (isDefaultMode) return;
        if (isSwitching) return;
        if (!isVerified) return;
        if (selectedPlaceId && places.some(p => p.id === selectedPlaceId)) autoEnteredRef.current.clear();
        const wantedPlace = pendingPlaceRef.current;
        if (wantedPlace) {
            if (places.some(p => p.id === wantedPlace)) {
                pendingPlaceRef.current = null;
                if (wantedPlace !== selectedPlaceId && switchPlace(wantedPlace)) {
                    autoEnteredRef.current.add(wantedPlace);
                }
                return;
            }
            if (places.length > 0) pendingPlaceRef.current = null;
        }
        const remembered = activeCloudId ? useLastChannelStore.getState().placeByCloud[activeCloudId] : undefined;
        const untried = places.filter(p => !autoEnteredRef.current.has(p.id));
        const targetId = placeToEnter(untried, selectedPlaceId, remembered);
        if (targetId && switchPlace(targetId)) autoEnteredRef.current.add(targetId);
    }, [isDefaultMode, isSwitching, isVerified, places, selectedPlaceId, switchPlace, activeCloudId]);

    const recordKnownChannels = useKnownChannelsStore(s => s.record);
    useEffect(() => {
        if (!activeCloudId || !selectedPlaceId || isDefaultMode || channels.length === 0) return;
        recordKnownChannels(activeCloudId, selectedPlaceId, channels, myUid);
    }, [activeCloudId, selectedPlaceId, isDefaultMode, channels, recordKnownChannels, myUid]);

    const rememberPlace = useLastChannelStore(s => s.rememberPlace);
    useEffect(() => {
        if (activeCloudId && selectedPlaceId && places.some(p => p.id === selectedPlaceId)) {
            rememberPlace(activeCloudId, selectedPlaceId);
        }
    }, [activeCloudId, selectedPlaceId, places, rememberPlace]);

    useEffect(() => {
        closeSettings();
        closeThread();
        closeProfile();
        closeSaved();
    }, [selectedChannelId, closeSettings, closeThread, closeProfile, closeSaved]);

    useEffect(() => {
        closeSaved();
    }, [activeCloudId, closeSaved]);

    useEffect(() => {
        setRoomOpenedHere(false);
    }, [activeCloudId, selectedPlaceId]);

    const listedChannelIds = useMemo(() => new Set(channels.map(channel => channel.id ?? '')), [channels]);

    useEffect(() => {
        const pendingId = pendingChannelRef.current;
        if (!pendingId) {
            redirectedPendingRef.current = null;
            pendingNamedPlaceRef.current = '';
        }
        if (isLoading || isSwitching || pendingPlaceRef.current) return;
        const placeId = pendingRedirectPlace(pendingId, {
            placeId: selectedPlaceId,
            listedIds: listedChannelIds,
            filedPlaces,
            redirectedId: redirectedPendingRef.current,
            namedPlaceId: pendingNamedPlaceRef.current,
            placeBound: !!pendingId && isPlaceBound(pendingId),
        });
        if (!placeId) return;
        redirectedPendingRef.current = pendingId;
        switchPlaceForOpen(placeId);
    }, [listedChannelIds, isLoading, isSwitching, filedPlaces, selectedPlaceId, switchPlace]);

    useEffect(() => {
        const scope = `${activeCloudId ?? 'default'}:${selectedPlaceId ?? ''}`;
        const landing = landingTarget(channels, {
            pendingChannelId: pendingChannelRef.current,
            selectedChannelId,
            rememberedChannelId: useLastChannelStore.getState().byScope[scope],
            placeSettled: !awaitedPlaceRef.current || (selectedSiteId === awaitedPlaceRef.current && !isSwitching),
        });
        if (!landing) return;
        selectChannel(landing.channelId);
        if (landing.kind === 'pending') {
            const pending = landing.channelId;
            setRoomOpenedHere(true);
            pendingChannelRef.current = null;
            awaitedPlaceRef.current = null;
            redirectedPendingRef.current = null;
            pendingNamedPlaceRef.current = '';
            if (pendingOpenAtBottomRef.current === pending) {
                pendingOpenAtBottomRef.current = null;
                requestOpenAtBottom(pending);
            }
            const jump = pendingJumpRef.current;
            if (jump && jump.channelId === pending) {
                pendingJumpRef.current = null;
                requestMessageJump(pending, jump.chatNo, { restore: jump.restore });
            }
        }
    }, [
        channels,
        selectedChannelId,
        selectChannel,
        requestMessageJump,
        requestOpenAtBottom,
        activeCloudId,
        selectedPlaceId,
        selectedSiteId,
        isSwitching,
    ]);

    const rememberLastChannel = useLastChannelStore(s => s.remember);
    useEffect(() => {
        if (selectedChannelId && channels.some(c => c.id === selectedChannelId)) {
            rememberLastChannel(`${activeCloudId ?? 'default'}:${selectedPlaceId ?? ''}`, selectedChannelId);
        }
    }, [selectedChannelId, channels, activeCloudId, selectedPlaceId, rememberLastChannel]);

    useEffect(() => {
        const pending = pendingThreadRef.current;
        if (!pending) return;
        if (selectedChannelId === pending.channelId && channels.some(channel => channel.id === pending.channelId)) {
            pendingThreadRef.current = null;
            openThread(pending.rootId, pending.channelId);
        }
    }, [channels, selectedChannelId, openThread]);

    const selectedChannel = channels.find(channel => channel.id === selectedChannelId);

    const openThreadNowOrDeferRef = useRef(openThreadNowOrDefer);
    openThreadNowOrDeferRef.current = openThreadNowOrDefer;
    const selectFromList = useCallback<SelectConversation>(
        (id, thread) => {
            useMessageJumpStore.getState().clearOrigin();
            closeSaved();
            setRoomOpenedHere(true);
            selectChannel(id);
            if (thread) openThreadNowOrDeferRef.current(id, thread.threadRootId);
        },
        [selectChannel, closeSaved]
    );
    useNextUnreadShortcut(channels, selectedChannelId, selectFromList);
    const jumpToSavedRef = useRef(jumpToSaved);
    jumpToSavedRef.current = jumpToSaved;

    const knownByCloud = useKnownChannelsStore(s => s.byCloud);
    const knownPeers = useMemo(() => {
        const known = activeCloudId ? knownByCloud[activeCloudId] : undefined;
        const railPlaces = new Set(places.map(place => place.id ?? ''));
        return Object.values(known ?? {}).flatMap(entry =>
            entry.peerId &&
            entry.placeId !== selectedPlaceId &&
            railPlaces.has(entry.placeId) &&
            !listedChannelIds.has(entry.channelId)
                ? [{ channelId: entry.channelId, peerId: entry.peerId }]
                : []
        );
    }, [knownByCloud, activeCloudId, listedChannelIds, places, selectedPlaceId]);
    const knownPeerProfiles = useCloudProfiles(useMemo(() => knownPeers.map(peer => peer.peerId), [knownPeers]));
    useHydrateDmPeers(knownPeers.filter(peer => !knownPeerProfiles.get(peer.peerId)?.name));
    const elsewhereChannels = useMemo(() => {
        if (!activeCloudId || isDefaultMode) return [];
        const known = knownByCloud[activeCloudId];
        if (!known) return [];
        return elsewhereChannelRows(known, {
            placeId: selectedPlaceId,
            placeName: new Map(places.map(place => [place.id ?? '', place.name ?? place.id ?? ''])),
            listedIds: listedChannelIds,
            peerName: peerId => knownPeerProfiles.get(peerId)?.name ?? '',
        });
    }, [knownByCloud, activeCloudId, isDefaultMode, selectedPlaceId, places, listedChannelIds, knownPeerProfiles]);

    const selectElsewhere = useCallback((channelId: string, placeId: string) => {
        jumpToSavedRef.current(channelId, undefined, placeId);
        useMessageJumpStore.getState().clearOrigin();
    }, []);

    const channelsRef = useRef(channels);
    channelsRef.current = channels;
    const openCreatedChannel = useCallback(
        (channelId: string) => {
            if (channelsRef.current.some(channel => channel.id === channelId)) {
                selectChannel(channelId);
                return;
            }
            pendingChannelRef.current = channelId;
            pendingNamedPlaceRef.current = '';
            armPendingExpiry();
        },
        [selectChannel]
    );
    const openJoinDialog = useJoinDialogStore(s => s.open);
    const chatEmptyState = useMemo(
        () =>
            navActive === 'notifications' && !isLoading
                ? ({ mode: 'inbox' } as const)
                : isLoading || channels.length > 0
                  ? ({ mode: 'pick' } as const)
                  : isDefaultMode
                    ? isGuest
                        ? ({ mode: 'join', onAction: openJoinDialog } as const)
                        : ({ mode: 'pick' } as const)
                    : ({ mode: 'create', onAction: openCreateChannel } as const),
        [navActive, isLoading, channels.length, isDefaultMode, isGuest, openJoinDialog, openCreateChannel]
    );

    const jumpFromSearch = useCallback(
        (channelId: string, chatNo: number, threadRootId?: string) =>
            jumpToSavedRef.current(channelId, chatNo, undefined, threadRootId),
        []
    );

    const jumpOrigin = useMessageJumpStore(s => s.origin);
    const clearJumpOrigin = useMessageJumpStore(s => s.clearOrigin);
    const restorePosition = (origin: MessageJumpOrigin) => {
        const { channelId, anchorChatNo, threadRootId } = origin;
        const route = returnRoute(origin, here);
        if (route !== 'select') {
            pendingChannelRef.current = channelId;
            pendingNamedPlaceRef.current = '';
            pendingThreadRef.current = threadRootId ? { channelId, rootId: threadRootId } : null;
            pendingJumpRef.current = anchorChatNo != null ? { channelId, chatNo: anchorChatNo, restore: true } : null;
            pendingOpenAtBottomRef.current = anchorChatNo == null ? channelId : null;
            armPendingExpiry();
            if (route === 'switch-cloud') {
                if (origin.placeId && origin.placeId !== 'default') pendingPlaceRef.current = origin.placeId;
                void switchAfterHandshake(() => switchCloud(origin.cloudId));
            } else if (origin.placeId) {
                switchPlaceForOpen(origin.placeId);
            }
            return;
        }
        setRoomOpenedHere(true);
        selectChannel(channelId);
        if (anchorChatNo != null) {
            requestMessageJump(channelId, anchorChatNo, { restore: true });
        } else if (channelId !== selectedChannelId) {
            requestOpenAtBottom(channelId);
        } else {
            requestMessageJump(channelId, null, { restore: true });
        }
        if (threadRootId) openThreadNowOrDefer(channelId, threadRootId);
        else if (channelId === selectedChannelId) closeThread();
    };
    const returnToOrigin = (origin: MessageJumpOrigin) => {
        if (isSwitching) return;
        clearJumpOrigin();
        restorePosition(origin);
    };
    const goThroughHistory = (direction: HistoryDirection) => {
        if (isSwitching) return;
        if (direction === 'back' && jumpReturn && jumpOrigin) {
            const last = useChannelHistoryStore.getState().back.at(-1);
            const barIsLastStep = !jumpOrigin.sameChannel && !!last && sameRoom(last, jumpOrigin);
            if (!barIsLastStep) {
                returnToOrigin(jumpOrigin);
                return;
            }
        }
        const target = channelHistory.step(direction, isReachable);
        if (!target) return;
        clearJumpOrigin();
        restorePosition(target);
    };
    const jumpReturn = shouldOfferReturn(jumpOrigin, here, listedChannelIds)
        ? {
              originName: jumpOrigin.channelId === selectedChannelId ? undefined : jumpOrigin.label,
              onReturn: () => goThroughHistory('back'),
              onDismiss: clearJumpOrigin,
          }
        : undefined;
    useHistoryPress(goThroughHistory);
    const settingsChannel = settingsChannelId ? channels.find(channel => channel.id === settingsChannelId) : undefined;
    const selectedPlace = places.find(place => place.id === selectedPlaceId);
    const placeName = selectedPlace?.name?.trim() || selectedPlace?.id || '';
    const welcome = usePlaceWelcome({
        channels,
        placeId: hasNoPlace ? undefined : (selectedPlaceId ?? undefined),
        isLoading: isLoading || isSwitching,
        isDefaultMode,
    });
    const openPlaceInvite = useSendInviteStore(s => s.openPlace);
    const showWelcome = welcome.show && navActive === 'home' && (!selectedChannel || !roomOpenedHere);
    const cloudHasUnread = useUnreadStore(s => s.total) > 0;

    const {
        members,
        isLoading: membersLoading,
        error: membersError,
        syncError: membersSyncError,
        retry: retryMembers,
    } = useChannelMembers(selectedChannel?.id ?? null, selectedChannel?.ownerId);

    const markRead = useReadCursorStore(s => s.markRead);
    const selectedLastChatNo = selectedChannel ? lastChatNoOf(selectedChannel) : 0;
    useEffect(() => {
        if (selectedChannelId && selectedLastChatNo > 0 && isWindowActive()) {
            markRead(selectedChannelId, selectedLastChatNo);
        }
    }, [selectedChannelId, selectedLastChatNo, markRead]);

    const selectCloudFromRail = (cloudId: string) => {
        clearJumpOrigin();
        void switchCloud(cloudId);
    };
    const selectPlaceFromRail = (placeId: string) => {
        clearJumpOrigin();
        switchPlace(placeId);
    };
    useRailShortcuts({
        clouds,
        places,
        activeCloudId,
        onSelectCloud: selectCloudFromRail,
        onSelectPlace: selectPlaceFromRail,
        isSwitching: railLocked,
        isDefaultMode,
    });

    return (
        <>
            <ForwardFileHost channels={channels} />
            <DesktopLayout
                rail={
                    <>
                        <CloudSwitcher
                            clouds={clouds}
                            activeCloudId={activeCloudId}
                            hasUnread={cloudHasUnread}
                            badgedClouds={badgedClouds}
                            onSelectCloud={selectCloudFromRail}
                            isSwitching={railLocked}
                            isCatalogError={isCloudsError}
                            isRetryingCatalog={isFetchingClouds}
                            onRetryCatalog={() => void refetchClouds()}
                        />
                        <PlaceRail
                            places={places}
                            selectedPlaceId={selectedPlaceId}
                            unreadByPlace={unreadByPlace}
                            isDefaultMode={isDefaultMode}
                            isSwitching={isSwitching}
                            onSelectPlace={selectPlaceFromRail}
                            canManagePlaces={mayManagePlacesHere}
                            onCreatePlace={() => setCreatePlaceOpen(true)}
                            onEditPlace={openEditPlace}
                            onDeletePlace={deletePlace}
                        />
                    </>
                }
                nav={
                    <NavRail
                        items={NAV_ITEMS}
                        unread={{ notifications: hasInboxUnread, channels: hasChannelUnread, dm: hasDmUnread }}
                        place={isDefaultMode ? undefined : places.find(p => p.id === selectedPlaceId)}
                        extra={<MiniAppRailButton />}
                    />
                }
                sidebarWidth={navActive === 'home' ? undefined : NAV_PANEL_WIDTH}
                sidebar={
                    <NavSidebar
                        active={navActive}
                        notifications={
                            <NotificationsPanel
                                cloudId={scopeCloudId}
                                channels={channels}
                                currentPlaceId={selectedPlaceId ?? undefined}
                                placeScope={inboxScope}
                                onSelect={jumpToSaved}
                            />
                        }
                        channels={
                            <ChannelListPanel
                                channels={channels}
                                selectedChannelId={selectedChannelId}
                                onSelect={selectFromList}
                                onCreateChannel={isDefaultMode ? undefined : openCreateChannel}
                                isLoading={isLoading}
                            />
                        }
                        dm={
                            <DmListPanel
                                channels={channels}
                                selectedChannelId={selectedChannelId}
                                onSelect={selectFromList}
                                onCreateDm={canStartDm && !hasNoPlace ? () => setIsNewDmOpen(true) : undefined}
                                isLoading={isLoading}
                            />
                        }
                        home={
                            <>
                                <SidebarHeader
                                    placeName={placeName}
                                    isLoading={placesLoading}
                                    isDefaultMode={isDefaultMode}
                                    query={query}
                                    onQueryChange={setQuery}
                                    onEditPlaceProfile={openEditPlaceProfile}
                                    onOpenSaved={() => openSaved('saved')}
                                    isSavedOpen={savedOpen && mainPage === 'saved'}
                                    onOpenThreads={() => openSaved('threads')}
                                    isThreadsOpen={savedOpen && mainPage === 'threads'}
                                    hasUnreadThreads={hasUnreadThreads}
                                />
                                <div className="flex-1 overflow-y-auto scrollbar-hide">
                                    <ChannelList
                                        channels={channels}
                                        isLoading={isLoading}
                                        selectedChannelId={selectedChannelId}
                                        query={query}
                                        onSelect={selectFromList}
                                        onJumpToMessage={jumpFromSearch}
                                        elsewhereChannels={elsewhereChannels}
                                        onSelectElsewhere={selectElsewhere}
                                        isDefaultMode={isDefaultMode}
                                        onCreateChannel={openCreateChannel}
                                        onCreateDm={canStartDm && !hasNoPlace ? () => setIsNewDmOpen(true) : undefined}
                                        memberPeers={memberPeers}
                                        onStartDm={
                                            canStartDm && !hasNoPlace
                                                ? peerId => {
                                                      setStartingPeerId(peerId);
                                                      void startDm(peerId);
                                                  }
                                                : undefined
                                        }
                                        startingPeerId={isStarting ? startingPeerId : null}
                                    />
                                </div>
                            </>
                        }
                    />
                }
                main={
                    savedOpen && mainPage === 'threads' ? (
                        <ThreadsPage
                            cloudId={scopeCloudId}
                            channels={channels}
                            placeScope={inboxScope}
                            onOpen={jumpToSaved}
                        />
                    ) : savedOpen ? (
                        <SavedPage
                            cloudId={scopeCloudId}
                            channels={channels}
                            places={places}
                            currentPlaceId={selectedPlaceId ?? undefined}
                            onSelect={jumpToSaved}
                        />
                    ) : showWelcome ? (
                        <WelcomePage
                            placeName={placeName}
                            signals={welcome.signals}
                            onCreateChannel={openCreateChannel}
                            onInvite={selectedPlaceId ? () => openPlaceInvite(selectedPlaceId, placeName) : undefined}
                            onStartDm={canStartDm ? () => setIsNewDmOpen(true) : undefined}
                            onEditProfile={openEditPlaceProfile}
                            onLater={welcome.later}
                        />
                    ) : (
                        <ChatPane
                            channel={selectedChannel}
                            members={members}
                            membersLoading={membersLoading}
                            jumpReturn={jumpReturn}
                            emptyState={chatEmptyState}
                        />
                    )
                }
                panel={
                    showDebugPanel ? (
                        <DebugPanel />
                    ) : profileTarget ? (
                        <ProfilePanel />
                    ) : openThreadRootId && threadChannel ? (
                        <ThreadPanel
                            channel={threadChannel}
                            rootId={openThreadRootId}
                            members={members}
                            membersLoading={membersLoading}
                        />
                    ) : settingsChannel ? (
                        <ChannelSettingsPanel
                            channel={settingsChannel}
                            myUid={myUid}
                            members={members}
                            membersLoading={membersLoading}
                            membersError={membersError}
                            membersSyncError={membersSyncError}
                            onRetryMembers={retryMembers}
                        />
                    ) : undefined
                }
            />
            <CreateChannelDialog onCreated={openCreatedChannel} />
            <CreatePlaceDialog onEnter={enterPlace} onEntered={openEditPlaceProfile} />
            <EditPlaceDialog places={places} />
            {isNewDmOpen && <NewDmDialog open onOpenChange={setIsNewDmOpen} />}
            <SendInviteDialog />
            <InviteWaitingDialog />
            <PlaceInviteLinkDialog />
            <EditPlaceProfileDialog />
            <OnboardingDialog
                enabled={!newAccountPending}
                showChannelStatus={isDefaultMode}
                isChannelReady={channels.some(isSelfChannel)}
                hasWorkspaces={clouds.some(cloud => cloud.kind !== 'home')}
            />
        </>
    );
};
