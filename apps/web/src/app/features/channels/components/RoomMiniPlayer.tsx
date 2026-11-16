import { useEffect, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';
import { MiniAudioPlayer } from '@chatic/web-ui-kit';

import { ROUTES } from '../../../routes/paths';
import { useMessageJumpStore } from '../../../stores/useMessageJumpStore';
import { useRoomAudioStore } from '../stores/roomAudioStore';
import { isVoiceMessageName } from '../utils/audioPlayback';

interface RoomMiniPlayerProps {
    channelId: string;
    /** The thread this surface shows, as its root's chatNo; omitted for the room. */
    threadRootNo?: string;
    /** The scrolling list the bubbles sit in. */
    containerRef: RefObject<HTMLElement | null>;
    /** Changes whenever the drawn rows change, so a bubble mounted later is found. */
    rowsVersion: unknown;
    /** Distance from the top of the screen, px — under the header. */
    top: number;
}

/**
 * The room's mini player (Figma 6072:23033): shown while a file is playing or paused mid-way and its
 * bubble is not on screen — scrolled away, or not drawn on this surface at all. Its body jumps back to
 * the bubble the way a search result does (`useMessageJumpStore`); a reply's file is in its thread, so
 * from the room that opens the thread first. × stops and unloads.
 *
 * Whether the bubble is on screen is asked of an `IntersectionObserver` on the list, against the
 * bubble's `data-audio-key` element.
 */
export const RoomMiniPlayer = ({ channelId, threadRootNo, containerRef, rowsVersion, top }: RoomMiniPlayerProps) => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const current = useRoomAudioStore(state => state.current);
    const status = useRoomAudioStore(state => state.status);
    const position = useRoomAudioStore(state => state.position);
    const duration = useRoomAudioStore(state => state.duration);
    const rate = useRoomAudioStore(state => state.rate);
    const [inView, setInView] = useState(false);
    const key = current?.channelId === channelId ? current.key : undefined;

    useEffect(() => {
        const root = containerRef.current;
        if (!key || !root || typeof IntersectionObserver === 'undefined') return undefined;
        const bubble = root.querySelector(`[data-audio-key="${CSS.escape(key)}"]`);
        // Only a missing bubble is known to be off screen at once; a found one keeps the last answer
        // until its observer speaks, so a list update does not flash the player for a frame.
        if (!bubble) {
            setInView(false);
            return undefined;
        }
        const observer = new IntersectionObserver(entries => setInView(entries.some(entry => entry.isIntersecting)), {
            root,
        });
        observer.observe(bubble);
        return () => observer.disconnect();
    }, [key, containerRef, rowsVersion]);

    const shown = !!current && !!key && status !== 'idle' && (status !== 'paused' || position > 0) && !inView;
    if (!shown || !current) return null;

    const name = isVoiceMessageName(current.name)
        ? t('chat.attach.audio.voiceMessage')
        : current.name || t('chat.attach.fileCard.fallbackName');
    const store = useRoomAudioStore.getState();

    const goToBubble = () => {
        const target = current.threadRootNo;
        if (target && target !== threadRootNo) {
            navigate(ROUTES.channels.thread(channelId, target));
        }
        useMessageJumpStore
            .getState()
            .request(channelId, current.chatNo, target ? { threadRootNo: target } : undefined);
    };

    return (
        <div className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-4" style={{ top }}>
            <MiniAudioPlayer
                name={name}
                playing={status === 'playing' || status === 'loading'}
                sender={current.senderName}
                position={position}
                duration={duration}
                rate={rate}
                onRateChange={store.cycleRate}
                onToggle={() => useRoomAudioStore.getState().toggle(current)}
                onClose={store.stop}
                onPress={goToBubble}
                playLabel={t('chat.attach.audio.play', { name })}
                pauseLabel={t('chat.attach.audio.pause', { name })}
                closeLabel={t('chat.attach.audio.closePlayer')}
                rateLabel={t('chat.attach.audio.rate')}
                className="pointer-events-auto w-full max-w-[343px]"
            />
        </div>
    );
};
