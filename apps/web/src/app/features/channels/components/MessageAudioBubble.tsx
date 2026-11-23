import { useTranslation } from 'react-i18next';

import type { ChatFileSlot } from '@chatic/runtime';
import { useNavigateWithTransition } from '@chatic/shared';
import {
    AudioMessageBubble,
    FailedSendActions,
    formatAudioMeta,
    formatAudioSize,
    type AudioMessageBubbleState,
} from '@chatic/web-ui-kit';

import { ROUTES } from '../../../routes/paths';
import { useFileDownloads } from '../hooks/useFileDownloads';
import { useAudioTrack, useRoomAudioStore } from '../stores/roomAudioStore';
import { audioTrackOf, canPlayAudioType, isVoiceMessageName, type AudioMessageInfo } from '../utils/audioPlayback';

export interface AudioMessageContext extends Omit<AudioMessageInfo, 'cid' | 'chatId' | 'chatNo'> {
    chatNo?: number;
    mine: boolean;
    failed?: boolean;
    onRetry?: () => void;
    onDelete?: () => void;
}

interface MessageAudioBubbleProps {
    file: ChatFileSlot;
    idx: number;
    cid: string;
    chatId?: string;
    sendProgress?: number;
    context: AudioMessageContext;
    className?: string;
}

export const MessageAudioBubble = ({
    file,
    idx,
    cid,
    chatId,
    sendProgress,
    context,
    className,
}: MessageAudioBubbleProps) => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const files = useFileDownloads({ cid, chatId });
    const view = useAudioTrack(file.key);
    const rate = useRoomAudioStore(s => s.rate);
    const store = useRoomAudioStore.getState();
    const track =
        chatId && context.chatNo
            ? audioTrackOf({ ...context, cid, chatId, chatNo: context.chatNo }, file, idx)
            : undefined;

    const name = isVoiceMessageName(file.name)
        ? t('chat.attach.audio.voiceMessage')
        : file.name?.trim() || t('chat.attach.fileCard.fallbackName');
    const size = formatAudioSize(file.size);
    const unplayable = view.unplayable || !canPlayAudioType(file.contentType);

    const state: AudioMessageBubbleState = (() => {
        if (context.failed || file.state === 'failed') return 'failed';
        if (file.state === 'sending') return 'sending';
        if (file.state === 'broken') return 'broken';
        if (unplayable) return 'unsupported';
        if (view.active) return view.status === 'idle' ? 'idle' : view.status;
        return view.position > 0 ? 'paused' : 'idle';
    })();

    const sendingText =
        file.size !== undefined && sendProgress !== undefined
            ? t('chat.attach.audio.sending', { done: formatAudioSize(file.size * sendProgress), total: size })
            : t('chat.attach.sending');

    return (
        <div data-audio-key={file.key} className={className}>
            <AudioMessageBubble
                side={context.mine ? 'mine' : 'other'}
                state={state}
                name={name}
                meta={formatAudioMeta(view.duration, file.size) || undefined}
                position={view.position}
                duration={view.duration}
                rate={rate}
                onRateChange={store.cycleRate}
                onToggle={track ? () => useRoomAudioStore.getState().toggle(track) : undefined}
                onSeek={seconds => useRoomAudioStore.getState().seekTrack(file.key, seconds)}
                onOpen={track ? () => navigate(ROUTES.channels.audio(track.channelId, track.chatNo, idx)) : undefined}
                sendProgress={sendProgress}
                sendingText={sendingText}
                onCancelSend={context.onDelete}
                onDownload={file.url ? () => void files.download(file) : undefined}
                failedText={t('chat.attach.audio.failed')}
                brokenText={t('chat.attach.audio.broken')}
                unsupportedText={
                    size ? t('chat.attach.audio.unsupportedSized', { size }) : t('chat.attach.audio.unsupported')
                }
                playLabel={t('chat.attach.audio.play', { name })}
                pauseLabel={t('chat.attach.audio.pause', { name })}
                cancelSendLabel={t('chat.attach.audio.cancelSend', { name })}
                downloadLabel={t('chat.attach.fileCard.download', { name })}
                seekLabel={t('chat.attach.audio.seek', { name })}
                rateLabel={t('chat.attach.audio.rate')}
                openLabel={t('chat.attach.audio.open', { name })}
            />
            {state === 'failed' && context.mine && context.onRetry && context.onDelete && (
                <FailedSendActions
                    onRetry={context.onRetry}
                    onDelete={context.onDelete}
                    retryLabel={t('chat.attach.audio.retry')}
                    deleteLabel={t('chat.attach.audio.delete')}
                    className="mt-1.5"
                />
            )}
        </div>
    );
};
