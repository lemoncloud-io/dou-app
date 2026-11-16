import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { useFreshAudioAddress } from '../hooks/useFreshAudioAddress';
import { useRoomAudioStore } from '../stores/roomAudioStore';

/** The channel a channel screen's path names — `/channels/<id>/…` — or none. */
export const channelOfPath = (pathname: string): string | undefined => {
    const match = /^\/channels\/([^/]+)\/(room|thread|audio|files|settings|invite)\b/.exec(pathname);
    return match?.[1];
};

/**
 * The channel screens' one `<audio>` and the rules around it. Mounted above the room, thread, audio
 * detail and file list routes, so moving between them never interrupts what is playing; leaving the
 * channel — another room, or out of the channel screens altogether — stops it and forgets where every
 * file was left.
 *
 * One sound at a time: anything else starting to play in the page (the media viewer's video) pauses
 * this player, and this player starting pauses everything else. `play` does not bubble, so one
 * capture-phase listener on the document hears every element.
 *
 * A file that fails to play may only have outlived its signed address, so the message is read again
 * once for a fresh one and play goes on from where it was. A second failure means this system cannot
 * play it: a toast says so and the track is marked unplayable, which every surface then draws.
 */
export const RoomAudioHost = () => {
    const { t } = useTranslation();
    const ref = useRef<HTMLAudioElement>(null);
    const { pathname } = useLocation();
    const pathChannel = channelOfPath(pathname);
    const freshAddress = useFreshAudioAddress();

    useEffect(() => {
        const store = useRoomAudioStore.getState();
        store.attach(ref.current);
        const pauseOthers = (event: Event) => {
            const started = event.target;
            const own = ref.current;
            if (!(started instanceof HTMLMediaElement) || !own) return;
            if (started === own) {
                document.querySelectorAll<HTMLMediaElement>('audio, video').forEach(media => {
                    if (media !== own && !media.paused) media.pause();
                });
                return;
            }
            if (!own.paused) own.pause();
        };
        document.addEventListener('play', pauseOthers, true);
        return () => {
            document.removeEventListener('play', pauseOthers, true);
            useRoomAudioStore.getState().reset();
            useRoomAudioStore.getState().attach(null);
        };
    }, []);

    // Another channel, or a path that is no channel screen: what was playing belonged to the room left.
    useEffect(() => {
        const { current, reset } = useRoomAudioStore.getState();
        if (current && current.channelId !== pathChannel) reset();
    }, [pathChannel]);

    // Keyed by address: a later expiry of the same file is a different address, and is read again too.
    // Only a fresh address failing as well says this system cannot play the file.
    const onError = async () => {
        const store = useRoomAudioStore.getState();
        const track = store.current;
        if (!track) return;
        store.onFailed();
        if (store.refreshed[track.url]) {
            store.markUnplayable(track.key);
            toast({ title: t('chat.attach.audio.playFailedToast'), variant: 'destructive' });
            return;
        }
        store.markRefreshed(track.url);
        const url = await freshAddress(track);
        // Another file was started meanwhile: this answer is not about what plays now.
        if (useRoomAudioStore.getState().current?.key !== track.key) return;
        if (url && url !== track.url) {
            useRoomAudioStore.getState().markRefreshed(url);
            useRoomAudioStore.getState().updateUrl(track.key, url);
            return;
        }
        // Offline, or the same address back: nothing says the format is at fault, so it is not marked.
        toast({ title: t('chat.attach.audio.playFailedToast'), variant: 'destructive' });
    };

    const store = useRoomAudioStore.getState();
    return (
        <audio
            ref={ref}
            preload="auto"
            className="hidden"
            data-testid="room-audio"
            onPlaying={store.onPlaying}
            onPause={store.onPause}
            onWaiting={store.onWaiting}
            onTimeUpdate={event => useRoomAudioStore.getState().onTimeUpdate(event.currentTarget.currentTime)}
            onDurationChange={event => useRoomAudioStore.getState().onDuration(event.currentTarget.duration)}
            onLoadedMetadata={store.onLoadedMetadata}
            onEnded={store.onEnded}
            onError={() => void onError()}
        />
    );
};
