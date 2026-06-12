import { useEffect, useRef, useState } from 'react';

import { useGlobalLoader } from '@chatic/shared';
import { useWebCoreStore } from '@chatic/web-core';

import { JoinWithInviteDialog } from '../../auth';
import {
    ChannelSettingsPanel,
    CreateChannelDialog,
    useChannelMembers,
    useChannelSettingsStore,
    useCreateChannelDialogStore,
} from '../../channels';
import { EditPlaceProfileDialog, useEditPlaceProfileDialogStore } from '../../profile';
import {
    ProfilePanel,
    lastChatNoOf,
    useChannels,
    useCloudPushBadgeStore,
    useClouds,
    useCloudSwitchFlow,
    useMessageJumpStore,
    usePendingOpenStore,
    usePlaces,
    useProfilePanelStore,
    useSavedPanelStore,
    useReadCursorStore,
    useSelectPlace,
    useSelectedChannelStore,
    useSelectedPlaceStore,
    useSiteProfileSync,
    useSiteProfiles,
    useUnreadStore,
} from '../../../shared';
import {
    ChannelList,
    ChatPane,
    CloudRail,
    DesktopLayout,
    OnboardingDialog,
    ShortcutsDialog,
    SidebarHeader,
    SwitchingOverlay,
    SavedPanel,
    ThreadPanel,
} from '../components';
import { useThreadStore } from '../stores';

const isWindowActive = (): boolean =>
    typeof document === 'undefined' || (document.visibilityState === 'visible' && document.hasFocus());

export const HomePage = () => {
    const { clouds, activeCloudId } = useClouds();
    const { places, isLoading: placesLoading } = usePlaces();
    // Unread is aggregated once in the always-mounted shell (ShellUnreadSync) and
    // published to the store — read it here for the rail/place switcher.
    const unreadByPlace = useUnreadStore(s => s.byPlace);
    // Other clouds' unread can't be counted (socket is active-cloud only) — a
    // received cross-cloud push marks its source cloud's tile instead.
    const badgedClouds = useCloudPushBadgeStore(s => s.badged);

    const selectedPlaceId = useSelectedPlaceStore(s => s.selectedPlaceId);
    const selectPlace = useSelectedPlaceStore(s => s.selectPlace);
    const { switchPlace } = useSelectPlace();
    const { switchCloud } = useCloudSwitchFlow({ onPlaceSelected: selectPlace });
    // True while a cloud/place switch handshake is in flight — disables the rail
    // cloud buttons so a second switch can't be fired mid-pipeline.
    const { isLoading: isSwitching } = useGlobalLoader();

    // Place Profiles: mirror the current place's overrides into the store (one
    // subscription) and pull deltas on place-switch / verified / reconnect.
    useSiteProfiles();
    useSiteProfileSync();

    const { channels, isLoading } = useChannels(selectedPlaceId ?? undefined);
    const selectedChannelId = useSelectedChannelStore(s => s.selectedChannelId);
    const selectChannel = useSelectedChannelStore(s => s.selectChannel);
    const requestMessageJump = useMessageJumpStore(s => s.request);
    const openCreateChannel = useCreateChannelDialogStore(s => s.open);
    const openEditPlaceProfile = useEditPlaceProfileDialogStore(s => s.open);
    const settingsChannelId = useChannelSettingsStore(s => s.openChannelId);
    const closeSettings = useChannelSettingsStore(s => s.close);
    const openThreadRootId = useThreadStore(s => s.openRootId);
    const closeThread = useThreadStore(s => s.close);
    const profileTarget = useProfilePanelStore(s => s.target);
    const closeProfile = useProfilePanelStore(s => s.close);
    const savedOpen = useSavedPanelStore(s => s.isOpen);
    const closeSaved = useSavedPanelStore(s => s.close);
    const openSaved = useSavedPanelStore(s => s.open);
    const myUid = useWebCoreStore(s => s.profile?.uid ?? null);
    // Default Cloud (relay / Guest Session): no joinable places — force the
    // 'default' place so the Self Channel loads; the sidebar hides the switcher.
    // activeCloudId (from useClouds) already resolves socket → persisted → fallback.
    const isDefaultMode = (activeCloudId ?? 'default') === 'default';

    const [query, setQuery] = useState('');
    // A channel to open once its place's channels have loaded (notification click
    // across places: switchPlace resets selection, so we re-apply it here).
    const pendingChannelRef = useRef<string | null>(null);
    // A message to scroll to once a cross-place jump's channel has loaded (paired
    // with pendingChannelRef when the saved item lives in another place).
    const pendingJumpRef = useRef<{ channelId: string; chatNo: number } | null>(null);

    // Open a saved item: when it lives in another place, switch place first and
    // defer the channel select + scroll until its channels load (apply effect
    // below); otherwise jump in place. The scroll is skipped without a chatNo.
    const jumpToSaved = (channelId: string, chatNo?: number, placeId?: string) => {
        if (placeId && placeId !== selectedPlaceId) {
            pendingChannelRef.current = channelId;
            pendingJumpRef.current = chatNo != null ? { channelId, chatNo } : null;
            void switchPlace(placeId);
            return;
        }
        selectChannel(channelId);
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
        const { placeId, channelId } = pendingOpen;
        if (placeId && placeId !== selectedPlaceId) {
            pendingChannelRef.current = channelId;
            void switchPlace(placeId);
        } else {
            selectChannel(channelId);
        }
        clearPendingOpen();
        // Re-fire only on a new notification (nonce), not on selectedPlaceId churn.
    }, [pendingOpen?.nonce]);

    // Default Cloud: pin the 'default' place (Self Channel). Otherwise select the
    // first place whenever the current selection isn't in the loaded list — covers
    // initial load AND a cloud switch / invite-join where the prior place (e.g.
    // 'default') doesn't exist in the newly-loaded cloud.
    useEffect(() => {
        if (isDefaultMode) {
            if (selectedPlaceId !== 'default') selectPlace('default');
            return;
        }
        // A cloud/place switch already owns place selection (useCloudSwitchFlow /
        // useSelectPlace commit the target). Don't auto-correct while one is in
        // flight: `places` and selectedPlaceId update on independent async timelines,
        // so a transient mismatch here would fire switchPlace() against a stale /
        // other-cloud place and thrash the channel list. Only act when idle.
        if (isSwitching) return;
        const inList = !!selectedPlaceId && places.some(p => p.id === selectedPlaceId);
        if (!inList && places.length > 0) {
            const firstId = places[0]?.id;
            // Use switchPlace (runs authPlace) — not the raw setter — so the first
            // place gets its per-place token in cloud mode; otherwise the channel
            // fetch hits an unauthed place and the shell stays stuck on the empty
            // state after a cloud-account login.
            if (firstId) void switchPlace(firstId);
        }
    }, [isDefaultMode, isSwitching, places, selectedPlaceId, selectPlace, switchPlace]);

    // The settings + thread panels belong to one channel — close both on switch.
    // The profile panel follows for a clean pane handoff.
    useEffect(() => {
        closeSettings();
        closeThread();
        closeProfile();
    }, [selectedChannelId, closeSettings, closeThread, closeProfile]);

    // Settings, thread, and profile share the one trailing pane — opening any
    // closes the others so the pane never has two owners (each effect fires on
    // its own opener only, so the last one opened wins).
    useEffect(() => {
        if (openThreadRootId) {
            closeSettings();
            closeProfile();
            closeSaved();
        }
    }, [openThreadRootId, closeSettings, closeProfile, closeSaved]);
    useEffect(() => {
        if (settingsChannelId) {
            closeThread();
            closeProfile();
            closeSaved();
        }
    }, [settingsChannelId, closeThread, closeProfile, closeSaved]);
    useEffect(() => {
        if (profileTarget) {
            closeThread();
            closeSettings();
            closeSaved();
        }
    }, [profileTarget, closeThread, closeSettings, closeSaved]);
    useEffect(() => {
        if (savedOpen) {
            closeThread();
            closeSettings();
            closeProfile();
        }
    }, [savedOpen, closeThread, closeSettings, closeProfile]);

    // The saved panel's rows belong to the place you opened it from — close it on
    // any place or cloud switch so it never shows another place's items.
    useEffect(() => {
        closeSaved();
    }, [selectedPlaceId, activeCloudId, closeSaved]);

    useEffect(() => {
        // Honor a pending notification / saved-jump target once its channel loads.
        const pending = pendingChannelRef.current;
        if (pending && channels.some(channel => channel.id === pending)) {
            pendingChannelRef.current = null;
            selectChannel(pending);
            // A deferred cross-place saved jump: now scroll to its message.
            const jump = pendingJumpRef.current;
            if (jump && jump.channelId === pending) {
                pendingJumpRef.current = null;
                requestMessageJump(pending, jump.chatNo);
            }
            return;
        }
        // Keep the current selection if it still exists in the loaded list (survives
        // a HomePage remount after navigating to profile/settings and back). Fall back
        // to the first channel only when the selection is absent — initial load, or a
        // place switch where the prior channel doesn't exist in the new place.
        const stillValid = !!selectedChannelId && channels.some(channel => channel.id === selectedChannelId);
        if (!stillValid && channels.length > 0) {
            const firstId = channels[0]?.id;
            if (firstId) selectChannel(firstId);
        }
    }, [channels, selectedChannelId, selectChannel, requestMessageJump]);

    const selectedChannel = channels.find(channel => channel.id === selectedChannelId);
    const settingsChannel = settingsChannelId ? channels.find(channel => channel.id === settingsChannelId) : undefined;
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
                        isSwitching={isSwitching}
                    />
                }
                sidebar={
                    <>
                        <SidebarHeader
                            places={places}
                            selectedPlaceId={selectedPlaceId}
                            unreadByPlace={unreadByPlace}
                            isLoading={placesLoading}
                            isDefaultMode={isDefaultMode}
                            query={query}
                            onQueryChange={setQuery}
                            onSelectPlace={placeId => void switchPlace(placeId)}
                            onCreateChannel={openCreateChannel}
                            onEditPlaceProfile={openEditPlaceProfile}
                            onOpenSaved={openSaved}
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
                main={<ChatPane channel={selectedChannel} members={members} membersLoading={membersLoading} />}
                panel={
                    openThreadRootId && selectedChannel ? (
                        <ThreadPanel
                            channel={selectedChannel}
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
                    ) : undefined
                }
                overlay={<SwitchingOverlay />}
            />
            <CreateChannelDialog />
            <JoinWithInviteDialog />
            <EditPlaceProfileDialog />
            <ShortcutsDialog />
            <OnboardingDialog enabled={isDefaultMode} isChannelReady={channels.length > 0} />
        </>
    );
};
