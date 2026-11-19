import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { runtime, canModifyMessage, chatMediaItems } from '@chatic/runtime';
import { useNavigateWithTransition } from '@chatic/shared';
import {
    AudioDetailLayout,
    AudioDetailMoreSheet,
    formatAudioMeta,
    IconDownload,
    IconMore,
    IconShare,
    Waveform,
    type AudioDetailAction,
} from '@chatic/web-ui-kit';

import { useCanExportImages } from '../../../bridge/shellCapabilities';
import { toCloudId } from '../../../hooks/useCloudScope';
import { ROUTES } from '../../../routes/paths';
import { useMessageJumpStore } from '../../../stores/useMessageJumpStore';
import { threadRootNo } from '../../../utils/notifications/notificationModel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAudioWaveform } from '../hooks/useAudioWaveform';
import { useChannel } from '../hooks/useChannel';
import { useChatMessage } from '../hooks/useChatMessage';
import { useChatMutations } from '../hooks/useChatMutations';
import { useFileDownloads } from '../hooks/useFileDownloads';
import { useRoomSenderName } from '../hooks/useRoomSenderName';
import { useAudioTrack, useRoomAudioStore } from '../stores/roomAudioStore';
import { audioTrackOf, isVoiceMessageName } from '../utils/audioPlayback';

/** The sent time in the header — date and minute, in the reader's language. */
const formatSentAt = (ms: number | undefined, locale: string): string =>
    ms ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms)) : '';

/**
 * One audio upload, full screen (Figma 6066:21958 · 6066:22076): who sent it and when, a waveform
 * computed from the file on this device, the player, and save · share · more.
 *
 * It plays through the room's one player, so opening it does not interrupt what plays and leaving it
 * lets the file play on in the room — the bubble and the mini player pick it up. The sent time and
 * "View in chat" go back to the message the way a search result does (`useMessageJumpStore`); a
 * message deleted since has neither. "Forward to DoU" and "Copy link" from the design are not here:
 * the server cannot attach someone else's upload to another message, and messages have no links.
 */
export const AudioDetailPage = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const params = useParams<{ channelId: string; chatNo: string; idx: string }>();
    const channelId = params.channelId ?? '';
    const chatNo = Number(params.chatNo);
    const idx = Number(params.idx);
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const { channel } = useChannel(channelId || null);
    const cid = toCloudId(channel?.cid || selectedCloudId);
    const uid = runtime.session.useUidInCloud(cid) ?? undefined;
    const { chat, loading } = useChatMessage(cid, channelId, chatNo);
    const { deleteServerMessage } = useChatMutations();
    const canShare = useCanExportImages();
    const [moreOpen, setMoreOpen] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const file = useMemo(() => {
        if (!chat) return undefined;
        const split = chatMediaItems(chat.cid || cid, chat.upload$$);
        const at = split.fileSlots.indexOf(idx);
        const found = at >= 0 ? split.files[at] : undefined;
        return found?.audio ? found : undefined;
    }, [chat, cid, idx]);
    const files = useFileDownloads({ cid: chat?.cid || cid, chatId: chat?.id });
    const nameOf = useRoomSenderName(channel, uid);
    const senderName = chat ? nameOf(chat) : '';
    const rootNo = chat?.parentId ? threadRootNo(chat.parentId) : undefined;
    const track =
        chat && file
            ? audioTrackOf(
                  {
                      cid: chat.cid || cid,
                      channelId,
                      chatId: chat.id,
                      chatNo,
                      senderName,
                      sentAt: chat.createdAtMs,
                      ...(rootNo ? { threadRootNo: rootNo } : {}),
                  },
                  file,
                  idx
              )
            : undefined;
    const view = useAudioTrack(file?.key);
    const rate = useRoomAudioStore(state => state.rate);
    const bars = useAudioWaveform({
        scope: cid && uid ? { cid, uid } : undefined,
        uploadId: file?.uploadId,
        url: file?.url,
        sizeBytes: file?.size,
        durationSeconds: view.duration,
    });

    const deleted = !!chat?.hidden;
    const name = isVoiceMessageName(file?.name)
        ? t('chat.attach.audio.voiceMessage')
        : file?.name || t('chat.attach.fileCard.fallbackName');
    const progress = view.duration ? Math.min(view.position / view.duration, 1) : 0;
    const back = () => navigate(-1);

    const viewInChat = () => {
        if (!chat) return;
        if (rootNo) navigate(ROUTES.channels.thread(channelId, rootNo));
        else navigate(ROUTES.channels.room(channelId));
        useMessageJumpStore.getState().request(channelId, chatNo, rootNo ? { threadRootNo: rootNo } : undefined);
    };

    const actions: AudioDetailAction[] = file
        ? [
              {
                  key: 'save',
                  icon: <IconDownload size={24} />,
                  label: t('chat.attach.audio.save'),
                  onPress: () => void files.download(file),
                  busy: files.stateOf(file) === 'downloading',
              },
              ...(canShare
                  ? [
                        {
                            key: 'share',
                            icon: <IconShare size={24} />,
                            label: t('chat.attach.audio.share'),
                            onPress: () => void files.share(file),
                            busy: files.stateOf(file) === 'downloading',
                        },
                    ]
                  : []),
              {
                  key: 'more',
                  icon: <IconMore size={24} />,
                  label: t('chat.attach.audio.more'),
                  onPress: () => setMoreOpen(true),
              },
          ]
        : [];

    if (!file || !track) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-4 bg-background px-6 text-center">
                <p className="text-[15px] text-description">
                    {loading ? t('chat.attach.audio.detailLoading') : t('chat.attach.audio.detailMissing')}
                </p>
                {!loading && (
                    <button type="button" onClick={back} className="text-[15px] font-semibold text-foreground">
                        {t('chat.attach.audio.back')}
                    </button>
                )}
            </div>
        );
    }

    const store = useRoomAudioStore.getState();
    const mine = !!chat && !!uid && chat.ownerId === uid;
    const canDelete = !!chat && !deleted && canModifyMessage(chat, mine);

    return (
        <>
            <AudioDetailLayout
                senderName={senderName}
                sentAt={formatSentAt(chat?.createdAtMs, i18n.language)}
                onSentAtPress={deleted ? undefined : viewInChat}
                onCollection={() => navigate(ROUTES.channels.files(channelId, 'audio'))}
                onBack={back}
                waveform={
                    <Waveform
                        bars={bars}
                        seed={file.uploadId ?? file.key}
                        progress={progress}
                        onSeek={ratio => view.duration && store.seekTrack(file.key, ratio * view.duration)}
                        label={t('chat.attach.audio.waveform', { name })}
                    />
                }
                name={name}
                meta={formatAudioMeta(view.duration, file.size) || undefined}
                playing={view.status === 'playing'}
                loading={view.status === 'loading'}
                position={view.position}
                duration={view.duration}
                rate={rate}
                onToggle={() => useRoomAudioStore.getState().toggle(track)}
                onSeek={seconds => useRoomAudioStore.getState().seekTrack(file.key, seconds)}
                onSkip={delta => {
                    if (!view.active) return;
                    useRoomAudioStore.getState().skip(delta);
                }}
                onRateChange={store.cycleRate}
                actions={actions}
                labels={{
                    back: t('chat.attach.audio.back'),
                    collection: t('chat.attach.audio.collection'),
                    play: t('chat.attach.audio.play', { name }),
                    pause: t('chat.attach.audio.pause', { name }),
                    loading: t('chat.attach.audio.loading'),
                    skipBack: t('chat.attach.audio.skipBack'),
                    skipForward: t('chat.attach.audio.skipForward'),
                    seek: t('chat.attach.audio.seek', { name }),
                    rate: t('chat.attach.audio.rate'),
                }}
            />
            <AudioDetailMoreSheet
                open={moreOpen}
                onOpenChange={setMoreOpen}
                onViewInChat={deleted ? undefined : viewInChat}
                onReplyInThread={
                    deleted ? undefined : () => navigate(ROUTES.channels.thread(channelId, rootNo ?? chatNo))
                }
                onDelete={canDelete ? () => setConfirmDelete(true) : undefined}
                labels={{
                    title: t('chat.attach.audio.more'),
                    viewInChat: t('chat.attach.audio.viewInChat'),
                    replyInThread: t('chat.thread.replyAction'),
                    delete: t('chat.room.deleteMessage'),
                }}
            />
            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title={t('chat.room.deleteMessageTitle')}
                description={t('chat.room.deleteMessageDescription')}
                confirmLabel={t('chat.room.deleteMessageConfirm')}
                onConfirm={() => {
                    if (!chat?.id) return;
                    if (useRoomAudioStore.getState().current?.key === file.key) useRoomAudioStore.getState().stop();
                    void deleteServerMessage(chat.id).then(back, () => undefined);
                }}
            />
        </>
    );
};
