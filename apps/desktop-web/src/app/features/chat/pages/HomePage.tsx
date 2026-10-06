import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { runtime } from '@chatic/app-runtime';

import { JoinWithInviteDialog, useJoinDialogStore } from '../../auth';
import {
    ChannelSettingsPanel,
    CreateChannelDialog,
    NewDmDialog,
    useChannelMembers,
    useChannelSettingsStore,
    useCreateChannelDialogStore,
} from '../../channels';
import { DebugPanel } from '../../debug';
import { EditPlaceProfileDialog, useEditPlaceProfileDialogStore } from '../../profile';
import {
    ProfilePanel,
    lastChatNoOf,
    useChannels,
    useDebugModeStore,
    useCloudPushBadgeStore,
    useClouds,
    useCloudSwitchFlow,
    useMessageJumpStore,
    useOpenAtBottomStore,
    usePendingOpenStore,
    usePlaces,
    useProfilePanelStore,
    useSavedPanelStore,
    useMentionsPanelStore,
    useReadCursorStore,
    useSelectPlace,
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
    useUnreadStore,
    useCloudProfiles,
} from '../../../shared';
import {
    ChannelList,
    ChatPane,
    CloudRail,
    DesktopLayout,
    OnboardingDialog,
    PlaceRail,
    SidebarHeader,
    SavedPanel,
    MentionsPanel,
    ThreadPanel,
} from '../components';
import {
    useHydrateDmPeers,
    useMessageViewer,
    useNextUnreadShortcut,
    usePendingLanding,
    useReadCounts,
    useTrailingPanelOwners,
} from '../hooks';
import {
    elsewhereChannels as elsewhereChannelRows,
    landingTarget,
    openPlaceFor,
    pendingOpenRoute,
    pendingRedirectPlace,
} from '../utils';
import { useThreadStore } from '../stores';
import { originFor, returnRoute, shouldOfferReturn, type ReaderLocation } from '../utils';

const isWindowActive = (): boolean =>
    typeof document === 'undefined' || (document.visibilityState === 'visible' && document.hasFocus());

/** Upper bound for awaiting the socket handshake before a push-driven cloud/place switch. */
const HANDSHAKE_WAIT_TIMEOUT_MS = 10_000;

// A cloud/place switch re-issues tokens against the active server, so firing it over a
// half-open socket (cold start / just-refocused window) races the connection, fails, and
// rolls the selection back — stranding the notification target unopened. Wait for the base
// handshake first; on timeout fire anyway (best-effort, no worse than an immediate switch).
const switchAfterHandshake = async (doSwitch: () => void): Promise<void> => {
    await runtime.connection.getSocketManager().waitUntilVerified(HANDSHAKE_WAIT_TIMEOUT_MS);
    doSwitch();
};

export const HomePage = () => {
    const { clouds, activeCloudId, isCloudsError, isFetchingClouds, refetchClouds } = useClouds();
    const { places, isLoading: placesLoading } = usePlaces();
    // Unread is aggregated once in the always-mounted shell (ShellUnreadSync) and
    // published to the store — read it here for the rail/place switcher.
    const unreadByPlace = useUnreadStore(s => s.byPlace);
    // Other clouds' unread can't be counted (socket is active-cloud only) — a
    // received cross-cloud push marks its source cloud's tile instead.
    const badgedClouds = useCloudPushBadgeStore(s => s.badged);

    // The active place IS the session's selected site. On the Default Cloud the sidebar hides
    // the place switcher, so `selectedPlaceId` pins a 'default' sentinel as the UI scope key
    // (last-channel memory, panel props). That sentinel is a cloudId — never an sid, and no
    // channel record can match it. activeCloudId (from useClouds) already resolves socket →
    // persisted → fallback.
    const isDefaultMode = (activeCloudId ?? 'default') === 'default';
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const selectedPlaceId = isDefaultMode ? 'default' : selectedSiteId;

    const { switchPlace, isSwitching: isPlaceSwitching } = useSelectPlace();
    const { switchCloud, isSwitching: isCloudSwitching } = useCloudSwitchFlow();
    // True while a cloud/place switch handshake is in flight — disables the rail tiles and
    // suppresses the idle auto-select so it can't thrash against a mid-switch selection.
    const isSwitching = isPlaceSwitching || isCloudSwitching;
    // The token-exchange promise resolves BEFORE the socket rebinds and the new cloud's data
    // loads. Rapidly switching again in that gap races the sockets (the outgoing one still feeds
    // frames), which flickers the channel list. Keep the cloud rail locked until the socket has
    // re-verified on the new cloud — i.e. its data has actually loaded — not just until the
    // exchange resolves. isVerified is true whenever a cloud is settled, so this only bites during
    // the switch/reconnect window.
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const railLocked = isSwitching || !isVerified;

    // Place Profiles: mirror the current place's overrides into the store (one
    // subscription). Delta pulls are owned by the runtime (useBackgroundSync +
    // useRealtimeProfileSync), so no per-page sync hook is needed here.
    useSiteProfiles();

    // Scope the list by the session's site id, not by `selectedPlaceId`: the Default Cloud spans
    // several sites (the relay's own site holds the Self Channel), and its 'default' sentinel
    // would match no record. Mirrors apps/web useHomeChannels.
    // Only an invite join selects a site on the Default Cloud, so it usually has none, and then its
    // rows are listed without one — a new account's Self Channel among them.
    // A subscription cloud with no place at all still lists its 1:1s. Only once the places are known
    // to be empty — while they load or a switch is in flight, "no place" just means "not yet".
    const hasNoPlace = !isDefaultMode && !placesLoading && !isSwitching && places.length === 0;
    const { channels, isLoading, dmPlaces, memberPeers } = useChannels(selectedSiteId ?? undefined, {
        whenNoPlace: isDefaultMode ? 'relay' : hasNoPlace ? 'cloudDms' : 'nothing',
    });
    const selectedChannelId = useSelectedChannelStore(s => s.selectedChannelId);
    const selectChannel = useSelectedChannelStore(s => s.selectChannel);
    const requestMessageJump = useMessageJumpStore(s => s.request);
    const setJumpOrigin = useMessageJumpStore(s => s.setOrigin);
    const openCreateChannel = useCreateChannelDialogStore(s => s.open);
    // Only this screen opens the new-message picker, so its open state stays local.
    const [isNewDmOpen, setIsNewDmOpen] = useState(false);
    const { isAvailable: canStartDm, startDm } = useStartDm();
    const openEditPlaceProfile = useEditPlaceProfileDialogStore(s => s.open);
    const {
        threadRootId: openThreadRootId,
        settingsChannelId,
        profileTarget,
        savedOpen,
        activityOpen,
    } = useTrailingPanelOwners();
    const closeSettings = useChannelSettingsStore(s => s.close);
    const openThread = useThreadStore(s => s.open);
    const closeThread = useThreadStore(s => s.close);
    const closeProfile = useProfilePanelStore(s => s.close);
    const closeSaved = useSavedPanelStore(s => s.close);
    const openSaved = useSavedPanelStore(s => s.open);
    const closeActivity = useMentionsPanelStore(s => s.close);
    const openActivity = useMentionsPanelStore(s => s.open);
    // Debug panel docks into the trailing-panel slot (dev gate: DEV build or the
    // 7×-tap toggle). Top precedence so it owns the dock while open.
    const debugEnabled = useDebugModeStore(s => s.enabled);
    const debugPanelOpen = useDebugModeStore(s => s.overlayOpen);
    const showDebugPanel = (import.meta.env.DEV || debugEnabled) && debugPanelOpen;
    const myUid = runtime.session.useSessionIdentity().userId;

    const [query, setQuery] = useState('');
    // Deferred landings, and the timer that drops them — see usePendingLanding.
    const {
        pendingChannelRef,
        pendingPlaceRef,
        pendingJumpRef,
        pendingOpenAtBottomRef,
        pendingThreadRef,
        armPendingExpiry,
    } = usePendingLanding();
    // The place an open request named, kept for the redirect that settles a held open, and the room
    // that redirect has already moved once (see the redirect effect below).
    const pendingNamedPlaceRef = useRef('');
    const redirectedPendingRef = useRef<string | null>(null);
    const requestOpenAtBottom = useOpenAtBottomStore(s => s.request);

    // Open a thread on a channel that is being selected right now — the one rule every entry
    // point (saved item, mention, notification click) needs. Already the selected channel →
    // open inline, because nothing switches the panel shut and the deferred effect below would
    // not re-fire. A different channel → selecting it runs closeThread() on the way in, so
    // leave it on the ref and let that effect win afterwards.
    const openThreadNowOrDefer = (channelId: string, rootId: string) => {
        if (channelId !== selectedChannelId) {
            pendingThreadRef.current = { channelId, rootId };
            return;
        }
        pendingThreadRef.current = null;
        openThread(rootId);
    };

    const here: ReaderLocation = {
        cloudId: activeCloudId ?? 'default',
        placeId: selectedPlaceId ?? null,
        channelId: selectedChannelId,
    };
    const labelOf = useChannelLabels(channels);
    // Record where the reader stands BEFORE anything moves: the message they were
    // reading and the thread beside it, not only the channel. A jump inside the
    // open channel records too, because it moves them just as far.
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

    // Open a saved item: when it lives in another place, switch place first and
    // defer the channel select + scroll until its channels load (apply effect
    // below); otherwise jump in place. The scroll is skipped without a chatNo.
    const jumpToSaved = (channelId: string, chatNo?: number, requestedPlaceId?: string, threadRootId?: string) => {
        recordOrigin(channelId);
        // A 1:1 opens where it is listed, which its recorded place need not be.
        const placeId = openPlaceFor(
            { placeId: requestedPlaceId ?? '', channelId },
            { placeId: selectedPlaceId, dmPlaces }
        );
        if (placeId && placeId !== selectedPlaceId) {
            pendingChannelRef.current = channelId;
            pendingNamedPlaceRef.current = '';
            // A thread reply opens the thread panel once its channel loads; a
            // top-level message scrolls the main feed. Never both.
            pendingThreadRef.current = threadRootId ? { channelId, rootId: threadRootId } : null;
            pendingJumpRef.current = !threadRootId && chatNo != null ? { channelId, chatNo } : null;
            armPendingExpiry();
            switchPlace(placeId);
            return;
        }
        selectChannel(channelId);
        if (threadRootId) {
            openThreadNowOrDefer(channelId, threadRootId);
            return;
        }
        if (chatNo != null) requestMessageJump(channelId, chatNo);
    };

    // Notification-click target (set by the always-mounted listener in routes, so
    // it works from any route). Apply it: switch place if needed (the channel is
    // applied once it loads, below), else select directly — or, while this cloud's
    // list is still loading, hold it for the redirect effect to place. Clear once
    // consumed so returning to home later doesn't re-jump.
    const pendingOpen = usePendingOpenStore(s => s.target);
    const clearPendingOpen = usePendingOpenStore(s => s.clear);
    useEffect(() => {
        if (!pendingOpen?.channelId) return;
        const { cloudId, channelId, rootId } = pendingOpen;
        const activeCloud = activeCloudId ?? 'default';
        const sameCloud = !cloudId || cloudId === activeCloud;
        // A notification is a detour like any other jump, the open channel included:
        // it moves the reader to the latest or swaps the thread beside it.
        recordOrigin(channelId);
        // A reply opens the thread panel, a top-level message lands at the bottom of the feed.
        // Never both — the reply is not in the feed. Same exclusion jumpToSaved makes.
        pendingThreadRef.current = rootId ? { channelId, rootId } : null;
        pendingOpenAtBottomRef.current = rootId ? null : channelId;
        // A 1:1 opens where it is listed, and the named place is only its stamp — but which places
        // list it is unknown until the rows load (an open that remounts HomePage arrives before
        // then). Hold it; the redirect below settles the place once the list is in.
        pendingNamedPlaceRef.current = pendingOpen.placeId;
        if (sameCloud && isLoading) {
            pendingChannelRef.current = channelId;
            armPendingExpiry();
            clearPendingOpen();
            return;
        }
        // Another cloud's rooms are not loaded either; that switch lands first and redirects after.
        const placeId = sameCloud
            ? openPlaceFor(pendingOpen, { placeId: selectedPlaceId, dmPlaces })
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
            // Cross-cloud: switch cloud first. The target place lands via the
            // auto-select effect (pendingPlaceRef), then the channel via the
            // pending-channel effect — each once its data loads. Refs are set now
            // (before the awaited switch) so the deferred landing is armed regardless.
            pendingChannelRef.current = channelId;
            pendingPlaceRef.current = placeId || null;
            armPendingExpiry();
            void switchAfterHandshake(() => switchCloud(cloudId));
        } else if (route === 'switch-place') {
            pendingChannelRef.current = channelId;
            armPendingExpiry();
            void switchAfterHandshake(() => switchPlace(placeId));
        } else if (route === 'wait') {
            // Land on it through the pending-channel effect once the list carries it.
            pendingChannelRef.current = channelId;
            armPendingExpiry();
        } else {
            selectChannel(channelId);
            if (rootId) openThreadNowOrDefer(channelId, rootId);
            else {
                requestOpenAtBottom(channelId);
                pendingOpenAtBottomRef.current = null;
            }
        }
        clearPendingOpen();
        // Re-fire only on a new notification (nonce), not on selectedPlaceId churn.
    }, [pendingOpen?.nonce]);

    // Default Cloud pins the derived 'default' place (Self Channel) — nothing to select.
    // Otherwise select the first place whenever the session's selected site isn't in the
    // loaded list — covers initial load (sid null), a cloud switch, or an invite-join where
    // the prior site doesn't exist in the newly-loaded cloud.
    useEffect(() => {
        if (isDefaultMode) return;
        // A cloud/place switch already owns selection. Don't auto-correct while one is in
        // flight: `places` and selectedSiteId update on independent async timelines, so a
        // transient mismatch here would fire switchPlace() against a stale / other-cloud
        // place and thrash the channel list. Only act when idle.
        if (isSwitching) return;
        // A cross-cloud notification switch wants a SPECIFIC place — land it once the new
        // cloud's places load, ahead of the first-place fallback below.
        const wantedPlace = pendingPlaceRef.current;
        if (wantedPlace) {
            if (places.some(p => p.id === wantedPlace)) {
                pendingPlaceRef.current = null;
                if (wantedPlace !== selectedPlaceId) switchPlace(wantedPlace);
                return;
            }
            // Places loaded but the target isn't among them (stale/left) — drop it and
            // fall through to the first place instead of waiting forever.
            if (places.length > 0) pendingPlaceRef.current = null;
        }
        const inList = !!selectedPlaceId && places.some(p => p.id === selectedPlaceId);
        if (!inList && places.length > 0) {
            // The place you last had open in this cloud, when it still exists; the first
            // place only when there is none. Returning to a cloud used to always land on
            // its first place, whatever you had left it on.
            const remembered = activeCloudId ? useLastChannelStore.getState().placeByCloud[activeCloudId] : undefined;
            const targetId = remembered && places.some(p => p.id === remembered) ? remembered : places[0]?.id;
            // switchPlace → switchSite gives the place its per-place token + socket
            // re-auth; otherwise the channel fetch hits an unauthed site and the shell stays
            // stuck on the empty state after a cloud-account login.
            if (targetId) switchPlace(targetId);
        }
    }, [isDefaultMode, isSwitching, places, selectedPlaceId, switchPlace, activeCloudId]);

    // Keep an index of this cloud's channels per place, built from the places you
    // open. It is what lets the quick switcher offer a channel that lives in
    // another place instead of pretending the cloud is one place wide.
    const recordKnownChannels = useKnownChannelsStore(s => s.record);
    useEffect(() => {
        if (!activeCloudId || !selectedPlaceId || isDefaultMode || channels.length === 0) return;
        recordKnownChannels(activeCloudId, selectedPlaceId, channels, myUid);
    }, [activeCloudId, selectedPlaceId, isDefaultMode, channels, recordKnownChannels, myUid]);

    // Remember the place you have open in this cloud, for the restore above.
    const rememberPlace = useLastChannelStore(s => s.rememberPlace);
    useEffect(() => {
        if (activeCloudId && selectedPlaceId && places.some(p => p.id === selectedPlaceId)) {
            rememberPlace(activeCloudId, selectedPlaceId);
        }
    }, [activeCloudId, selectedPlaceId, places, rememberPlace]);

    // The settings + thread panels belong to one channel — close both on switch.
    // The profile panel follows for a clean pane handoff.
    useEffect(() => {
        closeSettings();
        closeThread();
        closeProfile();
    }, [selectedChannelId, closeSettings, closeThread, closeProfile]);

    // The saved + activity panes group their rows by place, current place first, so a
    // place switch leaves them valid — and closing them there made the same row click
    // produce two layouts (a cross-place jump closed the pane, a same-place jump kept
    // it). Only a cloud switch retires them: their items belong to the cloud.
    useEffect(() => {
        closeSaved();
        closeActivity();
    }, [activeCloudId, closeSaved, closeActivity]);

    const listedChannelIds = useMemo(() => new Set(channels.map(channel => channel.id ?? '')), [channels]);

    // A held or misplaced pending open (one that arrived while the list loaded, or a cross-cloud
    // open landed in a 1:1's stamped place) moves once to where the room is listed. Not mid-switch,
    // and not before a place is selected: the auto-select effect settles the place first, and a
    // redirect in that gap would spend the once-per-room move on the stamp.
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
            dmPlaces,
            redirectedId: redirectedPendingRef.current,
            namedPlaceId: pendingNamedPlaceRef.current,
        });
        if (!placeId) return;
        redirectedPendingRef.current = pendingId;
        switchPlace(placeId);
    }, [listedChannelIds, isLoading, isSwitching, dmPlaces, selectedPlaceId, switchPlace]);

    useEffect(() => {
        // Honor a pending notification / saved-jump target once its channel loads; otherwise keep a
        // selection that is still listed (a HomePage remount after profile/settings and back), or
        // restore the channel last opened in THIS cloud+place.
        const scope = `${activeCloudId ?? 'default'}:${selectedPlaceId ?? ''}`;
        const landing = landingTarget(channels, {
            pendingChannelId: pendingChannelRef.current,
            selectedChannelId,
            rememberedChannelId: useLastChannelStore.getState().byScope[scope],
        });
        if (!landing) return;
        selectChannel(landing.channelId);
        if (landing.kind === 'pending') {
            const pending = landing.channelId;
            pendingChannelRef.current = null;
            redirectedPendingRef.current = null;
            pendingNamedPlaceRef.current = '';
            // A deferred notification open lands at the latest message.
            if (pendingOpenAtBottomRef.current === pending) {
                pendingOpenAtBottomRef.current = null;
                requestOpenAtBottom(pending);
            }
            // A deferred cross-place saved jump: now scroll to its message.
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
    ]);

    // Remember the channel you have open in this cloud+place so returning restores it.
    const rememberLastChannel = useLastChannelStore(s => s.remember);
    useEffect(() => {
        if (selectedChannelId && channels.some(c => c.id === selectedChannelId)) {
            rememberLastChannel(`${activeCloudId ?? 'default'}:${selectedPlaceId ?? ''}`, selectedChannelId);
        }
    }, [selectedChannelId, channels, activeCloudId, selectedPlaceId, rememberLastChannel]);

    // Open a deferred thread (saved / mention click on a reply) once its channel is
    // the selected one and present in the loaded list. Declared after the
    // selectedChannelId cleanup effect so its closeThread() runs first on a switch —
    // this open then wins. Cross-place clicks land here too: the channel-apply effect
    // above selects the channel, flipping selectedChannelId and firing this.
    useEffect(() => {
        const pending = pendingThreadRef.current;
        if (!pending) return;
        if (selectedChannelId === pending.channelId && channels.some(channel => channel.id === pending.channelId)) {
            pendingThreadRef.current = null;
            openThread(pending.rootId);
        }
    }, [channels, selectedChannelId, openThread]);

    const selectedChannel = channels.find(channel => channel.id === selectedChannelId);

    // Stable handlers for the sidebar, whose rows are memo'd. Picking a channel from
    // the list is a deliberate move, not a detour, so it retires any return point.
    const selectFromList = useCallback(
        (id: string) => {
            useMessageJumpStore.getState().clearOrigin();
            selectChannel(id);
        },
        [selectChannel]
    );
    useNextUnreadShortcut(channels, selectedChannelId, selectFromList);
    const jumpToSavedRef = useRef(jumpToSaved);
    jumpToSavedRef.current = jumpToSaved;

    // What the quick switcher can offer beyond the open place: the cloud's index,
    // minus this place, named by the place each channel lives in. A place that is
    // no longer in the rail is dropped rather than shown as an unnamed chip.
    const knownByCloud = useKnownChannelsStore(s => s.byCloud);
    // A 1:1 elsewhere is named after its person; another place's profiles are not loaded here, so
    // their cloud profile names them.
    // Only the 1:1s the switcher would offer: listed elsewhere, in a place still on the rail.
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
    // Only an opened room loads its members, so a 1:1 filed from a place not visited yet asks for its
    // person here; until then the row carries the room name.
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

    // Picking one of those is the same move as jumping to a saved message in
    // another place: switch place, then land on the channel once it loads.
    // Like a pick from the list, it is a deliberate move and leaves no return point.
    const selectElsewhere = useCallback((channelId: string, placeId: string) => {
        jumpToSavedRef.current(channelId, undefined, placeId);
        useMessageJumpStore.getState().clearOrigin();
    }, []);

    // jumpToSaved closes over render state; the ref keeps the handler identity fixed
    // while always calling the current one.
    // The new channel is not in the list yet; the pending-channel effect selects
    // it the moment the list carries it.
    // it the moment the list carries it. When the cache already delivered it,
    // there is no list change left to wait for, so select now.
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
            isLoading || channels.length > 0
                ? ({ mode: 'pick' } as const)
                : isDefaultMode
                  ? ({ mode: 'join', onAction: openJoinDialog } as const)
                  : ({ mode: 'create', onAction: openCreateChannel } as const),
        [isLoading, channels.length, isDefaultMode, openJoinDialog, openCreateChannel]
    );

    const jumpFromSearch = useCallback(
        (channelId: string, chatNo: number, threadRootId?: string) =>
            jumpToSavedRef.current(channelId, chatNo, undefined, threadRootId),
        []
    );

    // The return leg of a jump: the same cloud, place and channel, the message that was
    // at the top of the feed and the thread that was open. It used to reopen the channel
    // alone, at its latest message with the thread shut, which is not where anyone was.
    const jumpOrigin = useMessageJumpStore(s => s.origin);
    const clearJumpOrigin = useMessageJumpStore(s => s.clearOrigin);
    const returnToOrigin = (origin: MessageJumpOrigin) => {
        // Going back ends the detour; it is not the start of a new one.
        clearJumpOrigin();
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
                switchPlace(origin.placeId);
            }
            return;
        }
        selectChannel(channelId);
        if (anchorChatNo != null) {
            requestMessageJump(channelId, anchorChatNo, { restore: true });
        } else if (channelId !== selectedChannelId) {
            requestOpenAtBottom(channelId);
        } else {
            // Same channel, where the feed stays mounted: ask it for the latest directly.
            // The channel's last chatNo can be a reply or a reaction, which has no row.
            requestMessageJump(channelId, null, { restore: true });
        }
        if (threadRootId) openThreadNowOrDefer(channelId, threadRootId);
        // A jump inside the channel may have opened a thread the reader did not have.
        else if (channelId === selectedChannelId) closeThread();
    };
    const jumpReturn = shouldOfferReturn(jumpOrigin, here, listedChannelIds)
        ? {
              // Back in the channel after a jump inside it: its name would say "you are here".
              originName: jumpOrigin.channelId === selectedChannelId ? undefined : jumpOrigin.label,
              onReturn: () => returnToOrigin(jumpOrigin),
              onDismiss: clearJumpOrigin,
          }
        : undefined;
    const settingsChannel = settingsChannelId ? channels.find(channel => channel.id === settingsChannelId) : undefined;
    // The place rail owns switching; the sidebar header shows only the active name.
    const selectedPlace = places.find(place => place.id === selectedPlaceId);
    const placeName = selectedPlace?.name?.trim() || selectedPlace?.id || '';
    const cloudHasUnread = useUnreadStore(s => s.total) > 0;

    // One member subscription per open channel, shared by the chat pane (author
    // names) and the settings panel (roster/kick) — avoids a duplicate fetch.
    const {
        members,
        isLoading: membersLoading,
        error: membersError,
        // Key off the RESOLVED channel (present in the loaded list), not the raw
        // store id: after a cloud switch the store can briefly hold the previous
        // cloud's channel, and fetching members for it fires a cross-cloud
        // channel.list-user at the new socket → 403 not-a-member on the relay.
    } = useChannelMembers(selectedChannel?.id ?? null, selectedChannel?.ownerId);

    // One read-state subscription per open channel, shared by the chat pane and the thread
    // panel — same reason the member subscription above lives here. Each mount registers a
    // join sync for the whole roster and observes the join cache, so a second one would run
    // the cache scan again on every emit for counts identical to the first's.
    const viewer = useMessageViewer(selectedChannel);
    const readCountOf = useReadCounts(selectedChannel, viewer);

    // Keep the open channel marked read up to its latest message (cursor grows as
    // new messages arrive while it's open), so it never shows unread after you
    // switch away. Gate on window focus/visibility: a message arriving while the
    // window is hidden must NOT advance the cursor, or the desktop-notification
    // hook treats it as already-read and suppresses the OS toast. On refocus,
    // ChatPane's useReadReceipts flushes the read, so the badge still clears.
    const markRead = useReadCursorStore(s => s.markRead);
    const selectedLastChatNo = selectedChannel ? lastChatNoOf(selectedChannel) : 0;
    useEffect(() => {
        if (selectedChannelId && selectedLastChatNo > 0 && isWindowActive()) {
            markRead(selectedChannelId, selectedLastChatNo);
        }
    }, [selectedChannelId, selectedLastChatNo, markRead]);

    return (
        <>
            <DesktopLayout
                rail={
                    <CloudRail
                        clouds={clouds}
                        activeCloudId={activeCloudId}
                        hasUnread={cloudHasUnread}
                        badgedClouds={badgedClouds}
                        // Switching from the rail is a deliberate move, like picking a
                        // channel from the list, so it retires any return point.
                        onSelectCloud={cloudId => {
                            clearJumpOrigin();
                            void switchCloud(cloudId);
                        }}
                        isSwitching={railLocked}
                        isCatalogError={isCloudsError}
                        isRetryingCatalog={isFetchingClouds}
                        onRetryCatalog={() => void refetchClouds()}
                    />
                }
                rail2={
                    <PlaceRail
                        places={places}
                        selectedPlaceId={selectedPlaceId}
                        unreadByPlace={unreadByPlace}
                        isDefaultMode={isDefaultMode}
                        isSwitching={isSwitching}
                        onSelectPlace={placeId => {
                            clearJumpOrigin();
                            switchPlace(placeId);
                        }}
                    />
                }
                sidebar={
                    <>
                        <SidebarHeader
                            placeName={placeName}
                            isLoading={placesLoading}
                            isDefaultMode={isDefaultMode}
                            query={query}
                            onQueryChange={setQuery}
                            onEditPlaceProfile={openEditPlaceProfile}
                            onOpenSaved={openSaved}
                            onOpenActivity={openActivity}
                        />
                        <div className="flex-1 overflow-y-auto scrollbar-hide">
                            <ChannelList
                                channels={channels}
                                isLoading={isLoading}
                                selectedChannelId={selectedChannelId}
                                query={query}
                                // Picking a channel from the list is a deliberate move,
                                // not a detour, so it retires any pending return point.
                                onSelect={selectFromList}
                                onJumpToMessage={jumpFromSearch}
                                elsewhereChannels={elsewhereChannels}
                                onSelectElsewhere={selectElsewhere}
                                isDefaultMode={isDefaultMode}
                                onCreateChannel={openCreateChannel}
                                // The picker's pool is the people in this place's channels, so a cloud
                                // with no place would only ever offer no one.
                                onCreateDm={canStartDm && !hasNoPlace ? () => setIsNewDmOpen(true) : undefined}
                                memberPeers={memberPeers}
                                onStartDm={canStartDm && !hasNoPlace ? peerId => void startDm(peerId) : undefined}
                            />
                        </div>
                    </>
                }
                main={
                    <ChatPane
                        channel={selectedChannel}
                        members={members}
                        membersLoading={membersLoading}
                        readCountOf={readCountOf}
                        jumpReturn={jumpReturn}
                        emptyState={chatEmptyState}
                    />
                }
                panel={
                    showDebugPanel ? (
                        <DebugPanel />
                    ) : profileTarget ? (
                        // Stacked on whichever panel it opened from; closing it shows that panel again.
                        <ProfilePanel />
                    ) : openThreadRootId && selectedChannel ? (
                        <ThreadPanel
                            channel={selectedChannel}
                            rootId={openThreadRootId}
                            members={members}
                            membersLoading={membersLoading}
                            readCountOf={readCountOf}
                        />
                    ) : settingsChannel ? (
                        <ChannelSettingsPanel
                            channel={settingsChannel}
                            myUid={myUid}
                            members={members}
                            membersLoading={membersLoading}
                            membersError={membersError}
                        />
                    ) : savedOpen ? (
                        <SavedPanel
                            channels={channels}
                            places={places}
                            currentPlaceId={selectedPlaceId ?? undefined}
                            onSelect={jumpToSaved}
                        />
                    ) : activityOpen ? (
                        <MentionsPanel
                            channels={channels}
                            places={places}
                            currentPlaceId={selectedPlaceId ?? undefined}
                            onSelect={jumpToSaved}
                        />
                    ) : undefined
                }
            />
            <CreateChannelDialog onCreated={openCreatedChannel} />
            {/* Mounted only while open: its candidate pool fans out one roster read per channel. */}
            {isNewDmOpen && <NewDmDialog open onOpenChange={setIsNewDmOpen} />}
            <JoinWithInviteDialog />
            <EditPlaceProfileDialog />
            {/* Ready means the Self Channel itself has arrived — not merely that some
                channel has, which is what the card used to claim. */}
            <OnboardingDialog
                enabled
                showChannelStatus={isDefaultMode}
                isChannelReady={channels.some(isSelfChannel)}
                hasWorkspaces={clouds.some(cloud => cloud.kind !== 'home')}
            />
        </>
    );
};
