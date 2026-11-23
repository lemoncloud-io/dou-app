import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { useFreshAudioAddress } from '../hooks/useFreshAudioAddress';
import { useRoomAudioStore } from '../stores/roomAudioStore';

export const channelOfPath = (pathname: string): string | undefined => {
    const match = /^\/channels\/([^/]+)\/(room|thread|audio|files|settings|invite)\b/.exec(pathname);
    return match?.[1];
};

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

    useEffect(() => {
        const { current, reset } = useRoomAudioStore.getState();
        if (current && current.channelId !== pathChannel) reset();
    }, [pathChannel]);

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
        if (useRoomAudioStore.getState().current?.key !== track.key) return;
        if (url && url !== track.url) {
            useRoomAudioStore.getState().markRefreshed(url);
            useRoomAudioStore.getState().updateUrl(track.key, url);
            return;
        }
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
