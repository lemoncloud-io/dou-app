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
    lastChatNoOf,
    useChannels,
    useClouds,
    useCloudSwitchFlow,
    usePendingOpenStore,
    usePlaces,
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
    ShortcutsDialog,
    SidebarHeader,
    SwitchingOverlay,
} from '../components';

export const HomePage = () => {
    const { clouds, activeCloudId } = useClouds();
    const { places, isLoading: placesLoading } = usePlaces();
    // Unread is aggregated once in the always-mounted shell (ShellUnreadSync) and
    // published to the store — read it here for the rail/place switcher.
    const unreadByPlace = useUnreadStore(s => s.byPlace);

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
    const openCreateChannel = useCreateChannelDialogStore(s => s.open);
    const openEditPlaceProfile = useEditPlaceProfileDialogStore(s => s.open);
    const settingsChannelId = useChannelSettingsStore(s => s.openChannelId);
    const closeSettings = useChannelSettingsStore(s => s.close);
    const myUid = useWebCoreStore(s => s.profile?.uid ?? null);
    // Default Cloud (relay / Guest Session): no joinable places — force the
    // 'default' place so the Self Channel loads; the sidebar hides the switcher.
    // activeCloudId (from useClouds) already resolves socket → persisted → fallback.
    const isDefaultMode = (activeCloudId ?? 'default') === 'default';

    const [query, setQuery] = useState('');
    // A channel to open once its place's channels have loaded (notification click
    // across places: switchPlace resets selection, so we re-apply it here).
    const pendingChannelRef = useRef<string | null>(null);

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
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        const inList = !!selectedPlaceId && places.some(p => p.id === selectedPlaceId);
        if (!inList && places.length > 0) {
            const firstId = places[0]?.id;
            // Use switchPlace (runs authPlace) — not the raw setter — so the first
            // place gets its per-place token in cloud mode; otherwise the channel
            // fetch hits an unauthed place and the shell stays stuck on the empty
            // state after a cloud-account login.
            if (firstId) void switchPlace(firstId);
        }
    }, [isDefaultMode, places, selectedPlaceId, selectPlace, switchPlace]);

    // The settings panel belongs to one channel — close it when you switch away.
    useEffect(() => {
        closeSettings();
    }, [selectedChannelId, closeSettings]);

    useEffect(() => {
        // Honor a pending notification target once its channel has loaded.
        const pending = pendingChannelRef.current;
        if (pending && channels.some(channel => channel.id === pending)) {
            pendingChannelRef.current = null;
            selectChannel(pending);
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
    }, [channels, selectedChannelId, selectChannel]);

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
    } = useChannelMembers(selectedChannelId ?? null, selectedChannel?.ownerId);

    // Keep the open channel marked read up to its latest message (cursor grows as
    // new messages arrive while it's open), so it never shows unread after you
    // switch away — independent of the read-receipt debounce / window focus.
    const markRead = useReadCursorStore(s => s.markRead);
    const selectedLastChatNo = selectedChannel ? lastChatNoOf(selectedChannel) : 0;
    useEffect(() => {
        if (selectedChannelId && selectedLastChatNo > 0) markRead(selectedChannelId, selectedLastChatNo);
    }, [selectedChannelId, selectedLastChatNo, markRead]);

    return (
        <>
            <DesktopLayout
                rail={
                    <CloudRail
                        clouds={clouds}
                        activeCloudId={activeCloudId}
                        hasUnread={cloudHasUnread}
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
                        />
                        <div className="flex-1 overflow-y-auto scrollbar-hide">
                            <ChannelList
                                channels={channels}
                                isLoading={isLoading}
                                selectedChannelId={selectedChannelId}
                                query={query}
                                onSelect={selectChannel}
                            />
                        </div>
                    </>
                }
                main={<ChatPane channel={selectedChannel} members={members} membersLoading={membersLoading} />}
                panel={
                    settingsChannel ? (
                        <ChannelSettingsPanel
                            channel={settingsChannel}
                            myUid={myUid}
                            members={members}
                            membersLoading={membersLoading}
                            membersError={membersError}
                        />
                    ) : undefined
                }
                overlay={<SwitchingOverlay />}
            />
            <CreateChannelDialog />
            <JoinWithInviteDialog />
            <EditPlaceProfileDialog />
            <ShortcutsDialog />
        </>
    );
};
