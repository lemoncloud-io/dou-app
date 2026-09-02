import { useEffect, useRef, useState } from 'react';

import { getSocketManager, useRuntimeSocketState } from '@chatic/app-runtime';
import { useSessionIdentity, useSessionSelection } from '@chatic/app-runtime';

import { JoinWithInviteDialog } from '../../auth';
import {
    ChannelSettingsPanel,
    CreateChannelDialog,
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
    useLastChannelStore,
    useSelectedChannelStore,
    useSiteProfiles,
    useUnreadStore,
} from '../../../shared';
import {
    ChannelList,
    ChatPane,
    CloudRail,
    DesktopLayout,
    OnboardingDialog,
    PlaceRail,
    ShortcutsDialog,
    SidebarHeader,
    SavedPanel,
    MentionsPanel,
    ThreadPanel,
} from '../components';
import { useMessageViewer, useReadCounts } from '../hooks';
import { useThreadStore } from '../stores';

const isWindowActive = (): boolean =>
    typeof document === 'undefined' || (document.visibilityState === 'visible' && document.hasFocus());

/** Upper bound for awaiting the socket handshake before a push-driven cloud/place switch. */
const HANDSHAKE_WAIT_TIMEOUT_MS = 10_000;

// A cloud/place switch re-issues tokens against the active server, so firing it over a
// half-open socket (cold start / just-refocused window) races the connection, fails, and
// rolls the selection back — stranding the notification target unopened. Wait for the base
// handshake first; on timeout fire anyway (best-effort, no worse than an immediate switch).
const switchAfterHandshake = async (doSwitch: () => void): Promise<void> => {
    await getSocketManager().waitUntilVerified(HANDSHAKE_WAIT_TIMEOUT_MS);
    doSwitch();
};

export const HomePage = () => {
    const { clouds, activeCloudId } = useClouds();
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
    const { selectedSiteId } = useSessionSelection();
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
    const { isVerified } = useRuntimeSocketState();
    const railLocked = isSwitching || !isVerified;

    // Place Profiles: mirror the current place's overrides into the store (one
    // subscription). Delta pulls are owned by the runtime (useBackgroundSync +
    // useRealtimeProfileSync), so no per-page sync hook is needed here.
    useSiteProfiles();

    // Scope the list by the session's site id, not by `selectedPlaceId`: the Default Cloud spans
    // several sites (the relay's own site holds the Self Channel), and its 'default' sentinel
    // would match no record. Mirrors apps/web useHomeChannels.
    const { channels, isLoading } = useChannels(selectedSiteId ?? undefined);
    const selectedChannelId = useSelectedChannelStore(s => s.selectedChannelId);
    const selectChannel = useSelectedChannelStore(s => s.selectChannel);
    const requestMessageJump = useMessageJumpStore(s => s.request);
    const openCreateChannel = useCreateChannelDialogStore(s => s.open);
    const openEditPlaceProfile = useEditPlaceProfileDialogStore(s => s.open);
    const settingsChannelId = useChannelSettingsStore(s => s.openChannelId);
    const closeSettings = useChannelSettingsStore(s => s.close);
    const openThreadRootId = useThreadStore(s => s.openRootId);
    const openThread = useThreadStore(s => s.open);
    const closeThread = useThreadStore(s => s.close);
    const profileTarget = useProfilePanelStore(s => s.target);
    const closeProfile = useProfilePanelStore(s => s.close);
    const savedOpen = useSavedPanelStore(s => s.isOpen);
    const closeSaved = useSavedPanelStore(s => s.close);
    const openSaved = useSavedPanelStore(s => s.open);
    const activityOpen = useMentionsPanelStore(s => s.isOpen);
    const closeActivity = useMentionsPanelStore(s => s.close);
    const openActivity = useMentionsPanelStore(s => s.open);
    // Debug panel docks into the trailing-panel slot (dev gate: DEV build or the
    // 7×-tap toggle). Top precedence so it owns the dock while open.
    const debugEnabled = useDebugModeStore(s => s.enabled);
    const debugPanelOpen = useDebugModeStore(s => s.overlayOpen);
    const showDebugPanel = (import.meta.env.DEV || debugEnabled) && debugPanelOpen;
    const myUid = useSessionIdentity().userId;

    const [query, setQuery] = useState('');
    // A channel to open once its place's channels have loaded (notification click
    // across places: switchPlace resets selection, so we re-apply it here).
    const pendingChannelRef = useRef<string | null>(null);
    // A place to land once a cross-cloud notification switch loads the new cloud's
    // places — the auto-select-first effect honors this instead of the first place.
    const pendingPlaceRef = useRef<string | null>(null);
    // A message to scroll to once a cross-place jump's channel has loaded (paired
    // with pendingChannelRef when the saved item lives in another place).
    const pendingJumpRef = useRef<{ channelId: string; chatNo: number } | null>(null);
    // Set when the deferred open is a NOTIFICATION click (not a saved jump): the
    // channel should land at its latest message once it loads (requestOpenAtBottom).
    const pendingOpenAtBottomRef = useRef<string | null>(null);
    const requestOpenAtBottom = useOpenAtBottomStore(s => s.request);
    // A thread to open once its channel is selected + loaded. Deferred (not opened
    // inline) because selecting a different channel runs closeThread() on its way
    // in — a same-tick open would be clobbered. Set for saved/mention thread replies.
    const pendingThreadRef = useRef<{ channelId: string; rootId: string } | null>(null);

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

    // Open a saved item: when it lives in another place, switch place first and
    // defer the channel select + scroll until its channels load (apply effect
    // below); otherwise jump in place. The scroll is skipped without a chatNo.
    const jumpToSaved = (channelId: string, chatNo?: number, placeId?: string, threadRootId?: string) => {
        if (placeId && placeId !== selectedPlaceId) {
            pendingChannelRef.current = channelId;
            // A thread reply opens the thread panel once its channel loads; a
            // top-level message scrolls the main feed. Never both.
            pendingThreadRef.current = threadRootId ? { channelId, rootId: threadRootId } : null;
            pendingJumpRef.current = !threadRootId && chatNo != null ? { channelId, chatNo } : null;
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
    // applied once it loads, below), else select directly. Clear once consumed so
    // returning to home later doesn't re-jump.
    const pendingOpen = usePendingOpenStore(s => s.target);
    const clearPendingOpen = usePendingOpenStore(s => s.clear);
    useEffect(() => {
        if (!pendingOpen?.channelId) return;
        const { cloudId, placeId, channelId, rootId } = pendingOpen;
        const activeCloud = activeCloudId ?? 'default';
        // A reply opens the thread panel, a top-level message lands at the bottom of the feed.
        // Never both — the reply is not in the feed. Same exclusion jumpToSaved makes.
        pendingThreadRef.current = rootId ? { channelId, rootId } : null;
        pendingOpenAtBottomRef.current = rootId ? null : channelId;
        if (cloudId && cloudId !== activeCloud) {
            // Cross-cloud: switch cloud first. The target place lands via the
            // auto-select effect (pendingPlaceRef), then the channel via the
            // pending-channel effect — each once its data loads. Refs are set now
            // (before the awaited switch) so the deferred landing is armed regardless.
            pendingChannelRef.current = channelId;
            pendingPlaceRef.current = placeId || null;
            void switchAfterHandshake(() => switchCloud(cloudId));
        } else if (placeId && placeId !== selectedPlaceId) {
            pendingChannelRef.current = channelId;
            void switchAfterHandshake(() => switchPlace(placeId));
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
            const firstId = places[0]?.id;
            // switchPlace → switchSite gives the first place its per-place token + socket
            // re-auth; otherwise the channel fetch hits an unauthed site and the shell stays
            // stuck on the empty state after a cloud-account login.
            if (firstId) switchPlace(firstId);
        }
    }, [isDefaultMode, isSwitching, places, selectedPlaceId, switchPlace]);

    // The settings + thread panels belong to one channel — close both on switch.
    // The profile panel follows for a clean pane handoff.
    useEffect(() => {
        closeSettings();
        closeThread();
        closeProfile();
    }, [selectedChannelId, closeSettings, closeThread, closeProfile]);

    // The one trailing pane has five possible owners (thread, settings, profile,
    // saved, activity) — opening any closes the others so the pane never has two
    // owners (each effect fires on its own opener only, so the last one opened wins).
    useEffect(() => {
        if (openThreadRootId) {
            closeSettings();
            closeProfile();
            closeSaved();
            closeActivity();
        }
    }, [openThreadRootId, closeSettings, closeProfile, closeSaved, closeActivity]);
    useEffect(() => {
        if (settingsChannelId) {
            closeThread();
            closeProfile();
            closeSaved();
            closeActivity();
        }
    }, [settingsChannelId, closeThread, closeProfile, closeSaved, closeActivity]);
    useEffect(() => {
        if (profileTarget) {
            closeThread();
            closeSettings();
            closeSaved();
            closeActivity();
        }
    }, [profileTarget, closeThread, closeSettings, closeSaved, closeActivity]);
    useEffect(() => {
        if (savedOpen) {
            closeThread();
            closeSettings();
            closeProfile();
            closeActivity();
        }
    }, [savedOpen, closeThread, closeSettings, closeProfile, closeActivity]);
    useEffect(() => {
        if (activityOpen) {
            closeThread();
            closeSettings();
            closeProfile();
            closeSaved();
        }
    }, [activityOpen, closeThread, closeSettings, closeProfile, closeSaved]);

    // The saved + activity panes' rows belong to the place you opened them from —
    // close both on any place or cloud switch so they never show another place's items.
    useEffect(() => {
        closeSaved();
        closeActivity();
    }, [selectedPlaceId, activeCloudId, closeSaved, closeActivity]);

    useEffect(() => {
        // Honor a pending notification / saved-jump target once its channel loads.
        const pending = pendingChannelRef.current;
        if (pending && channels.some(channel => channel.id === pending)) {
            pendingChannelRef.current = null;
            selectChannel(pending);
            // A deferred notification open lands at the latest message.
            if (pendingOpenAtBottomRef.current === pending) {
                pendingOpenAtBottomRef.current = null;
                requestOpenAtBottom(pending);
            }
            // A deferred cross-place saved jump: now scroll to its message.
            const jump = pendingJumpRef.current;
            if (jump && jump.channelId === pending) {
                pendingJumpRef.current = null;
                requestMessageJump(pending, jump.chatNo);
            }
            return;
        }
        // Keep the current selection if it still exists in the loaded list (survives
        // a HomePage remount after navigating to profile/settings and back). Otherwise
        // restore the channel last opened in THIS cloud+place (so switching away and back
        // returns to it), falling back to the first channel only when there is none —
        // initial load, or a place with no prior selection.
        const stillValid = !!selectedChannelId && channels.some(channel => channel.id === selectedChannelId);
        if (!stillValid && channels.length > 0) {
            const scope = `${activeCloudId ?? 'default'}:${selectedPlaceId ?? ''}`;
            const remembered = useLastChannelStore.getState().byScope[scope];
            const target = remembered && channels.some(c => c.id === remembered) ? remembered : channels[0]?.id;
            if (target) selectChannel(target);
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
    const settingsChannel = settingsChannelId ? channels.find(channel => channel.id === settingsChannelId) : undefined;
    // The place rail owns switching; the sidebar header shows only the active name.
    const selectedPlace = places.find(place => place.id === selectedPlaceId);
    const placeName = selectedPlace?.name?.trim() || selectedPlace?.id || '';
    const totalUnread = Object.values(unreadByPlace).reduce((sum, count) => sum + count, 0);
    const cloudHasUnread = totalUnread > 0;

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
                        onSelectCloud={cloudId => void switchCloud(cloudId)}
                        isSwitching={railLocked}
                    />
                }
                rail2={
                    <PlaceRail
                        places={places}
                        selectedPlaceId={selectedPlaceId}
                        unreadByPlace={unreadByPlace}
                        isDefaultMode={isDefaultMode}
                        isSwitching={isSwitching}
                        onSelectPlace={placeId => switchPlace(placeId)}
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
                            onCreateChannel={openCreateChannel}
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
                                onSelect={selectChannel}
                                isDefaultMode={isDefaultMode}
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
                    />
                }
                panel={
                    showDebugPanel ? (
                        <DebugPanel />
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
                    ) : profileTarget ? (
                        <ProfilePanel />
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
            <CreateChannelDialog />
            <JoinWithInviteDialog />
            <EditPlaceProfileDialog />
            <ShortcutsDialog />
            <OnboardingDialog enabled={isDefaultMode} isChannelReady={channels.length > 0} />
        </>
    );
};
