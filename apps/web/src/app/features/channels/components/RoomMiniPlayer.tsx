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
    threadRootNo?: string;
    containerRef: RefObject<HTMLElement | null>;
    rowsVersion: unknown;
    top: number;
}

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
