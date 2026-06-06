import { useEffect } from 'react';

import { CreateChannelDialog, useCreateChannelDialogStore } from '../../channels';
import { useChannels, usePlaces, useSelectedChannelStore, useSelectedPlaceStore } from '../../../shared';
import { ChannelList, ChatPane, DesktopLayout, PlaceRail } from '../components';

export const HomePage = () => {
    const { places } = usePlaces();
    const selectedPlaceId = useSelectedPlaceStore(s => s.selectedPlaceId);
    const selectPlace = useSelectedPlaceStore(s => s.selectPlace);

    const { channels, isLoading } = useChannels(selectedPlaceId ?? undefined);
    const selectedChannelId = useSelectedChannelStore(s => s.selectedChannelId);
    const selectChannel = useSelectedChannelStore(s => s.selectChannel);
    const clearChannel = useSelectedChannelStore(s => s.clearChannel);
    const openCreateChannel = useCreateChannelDialogStore(s => s.open);

    // Default the rail selection to the first place once places load.
    useEffect(() => {
        if (!selectedPlaceId && places.length > 0) {
            const firstId = places[0]?.id;
            if (firstId) selectPlace(firstId);
        }
    }, [places, selectedPlaceId, selectPlace]);

    // Reset the open channel whenever the active place changes; the next effect
    // then auto-selects the first channel of the newly-loaded place.
    useEffect(() => {
        clearChannel();
    }, [selectedPlaceId, clearChannel]);

    // Auto-select the first channel of the active place once the list loads.
    useEffect(() => {
        if (!selectedChannelId && channels.length > 0) {
            const firstId = channels[0]?.id;
            if (firstId) selectChannel(firstId);
        }
    }, [channels, selectedChannelId, selectChannel]);

    const selectedChannel = channels.find(channel => channel.id === selectedChannelId);

    return (
        <>
            <DesktopLayout
                rail={
                    <PlaceRail
                        places={places}
                        selectedPlaceId={selectedPlaceId}
                        onSelectPlace={selectPlace}
                        onCreateChannel={openCreateChannel}
                    />
                }
                sidebar={
                    <ChannelList
                        channels={channels}
                        isLoading={isLoading}
                        selectedChannelId={selectedChannelId}
                        onSelect={selectChannel}
                    />
                }
                main={<ChatPane channel={selectedChannel} />}
            />
            <CreateChannelDialog />
        </>
    );
};
