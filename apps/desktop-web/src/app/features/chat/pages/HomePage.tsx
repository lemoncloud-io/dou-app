import { useEffect, useState } from 'react';

import { useWebCoreStore } from '@chatic/web-core';

import {
    ChannelSettingsPanel,
    CreateChannelDialog,
    useChannelSettingsStore,
    useCreateChannelDialogStore,
} from '../../channels';
import {
    useChannels,
    useClouds,
    useCloudSwitchFlow,
    usePlaceUnreadCounts,
    usePlaces,
    useSelectPlace,
    useSelectedChannelStore,
    useSelectedPlaceStore,
} from '../../../shared';
import { ChannelList, ChatPane, CloudRail, DesktopLayout, SidebarHeader } from '../components';

export const HomePage = () => {
    const { clouds, activeCloudId } = useClouds();
    const { places, isLoading: placesLoading } = usePlaces();
    const unreadByPlace = usePlaceUnreadCounts();

    const selectedPlaceId = useSelectedPlaceStore(s => s.selectedPlaceId);
    const selectPlace = useSelectedPlaceStore(s => s.selectPlace);
    const { switchPlace } = useSelectPlace();
    const { switchCloud } = useCloudSwitchFlow({ onPlaceSelected: selectPlace });

    const { channels, isLoading } = useChannels(selectedPlaceId ?? undefined);
    const selectedChannelId = useSelectedChannelStore(s => s.selectedChannelId);
    const selectChannel = useSelectedChannelStore(s => s.selectChannel);
    const clearChannel = useSelectedChannelStore(s => s.clearChannel);
    const openCreateChannel = useCreateChannelDialogStore(s => s.open);
    const settingsChannelId = useChannelSettingsStore(s => s.openChannelId);
    const myUid = useWebCoreStore(s => s.profile?.uid ?? null);

    const [query, setQuery] = useState('');

    // Default to the first place once places load (socket is already verified for
    // the persisted place at this point, so no re-auth needed here).
    useEffect(() => {
        if (!selectedPlaceId && places.length > 0) {
            const firstId = places[0]?.id;
            if (firstId) selectPlace(firstId);
        }
    }, [places, selectedPlaceId, selectPlace]);

    // Reset the open channel when the active place changes; the next effect
    // auto-selects the first channel of the newly-loaded place.
    useEffect(() => {
        clearChannel();
    }, [selectedPlaceId, clearChannel]);

    useEffect(() => {
        if (!selectedChannelId && channels.length > 0) {
            const firstId = channels[0]?.id;
            if (firstId) selectChannel(firstId);
        }
    }, [channels, selectedChannelId, selectChannel]);

    const selectedChannel = channels.find(channel => channel.id === selectedChannelId);
    const settingsChannel = settingsChannelId ? channels.find(channel => channel.id === settingsChannelId) : undefined;
    const cloudHasUnread = Object.values(unreadByPlace).some(count => count > 0);

    return (
        <>
            <DesktopLayout
                rail={
                    <CloudRail
                        clouds={clouds}
                        activeCloudId={activeCloudId}
                        hasUnread={cloudHasUnread}
                        onSelectCloud={cloudId => void switchCloud(cloudId)}
                    />
                }
                sidebar={
                    <>
                        <SidebarHeader
                            places={places}
                            selectedPlaceId={selectedPlaceId}
                            unreadByPlace={unreadByPlace}
                            isLoading={placesLoading}
                            query={query}
                            onQueryChange={setQuery}
                            onSelectPlace={placeId => void switchPlace(placeId)}
                            onCreateChannel={openCreateChannel}
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
                main={<ChatPane channel={selectedChannel} />}
                panel={settingsChannel ? <ChannelSettingsPanel channel={settingsChannel} myUid={myUid} /> : undefined}
            />
            <CreateChannelDialog />
        </>
    );
};
