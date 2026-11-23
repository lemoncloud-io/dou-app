import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import {
    BottomSheet,
    IconCopy,
    IconDownload,
    IconEmojiAdd,
    IconSpinner,
    IconThread,
    SheetAction,
} from '@chatic/web-ui-kit';
import { Pencil, Share, Trash2 } from 'lucide-react';

import { useCanExportImages } from '../../../bridge/shellCapabilities';
import { useFileDownloads } from '../hooks/useFileDownloads';
import { useRecentEmojiStore, QUICK_REACTIONS } from '../stores/useRecentEmojiStore';
import type { ClientChatView } from '../types';
import { hasMyReaction, type ReactionTally } from '../utils/foldReactions';
import { audioFileOf, shareableFile } from '../utils/messageActions';

const QUICK_FALLBACK = ['😂', '❤️', '🙏', '😮'];
const QUICK_ROW_SIZE = 6;

interface MessageActionSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tallies?: ReactionTally[];
    canReact: boolean;
    canReply: boolean;
    canModify: boolean;
    hasText: boolean;
    isCopying: boolean;
    onPickEmoji: (emoji: string) => void;
    onMoreEmoji: () => void;
    onCopy: () => void;
    onReply: () => void;
    onEdit: () => void;
    onDelete: () => void;
    fileMessage?: Pick<ClientChatView, 'cid' | 'id' | 'upload$$' | 'chatNo' | 'hidden'> | null;
}

export const MessageActionSheet = ({
    open,
    onOpenChange,
    tallies,
    canReact,
    canReply,
    canModify,
    hasText,
    isCopying,
    onPickEmoji,
    onMoreEmoji,
    onCopy,
    onReply,
    onEdit,
    onDelete,
    fileMessage,
}: MessageActionSheetProps) => {
    const { t } = useTranslation();
    const recent = useRecentEmojiStore(s => s.recent);
    const canShareFiles = useCanExportImages();
    const files = useFileDownloads({ cid: fileMessage?.cid ?? '', chatId: fileMessage?.id });
    const audioFile = fileMessage ? audioFileOf(fileMessage) : undefined;
    const sharedFile = canShareFiles && fileMessage ? shareableFile(fileMessage) : undefined;

    const quickEmojis = [...new Set([...recent, ...QUICK_REACTIONS, ...QUICK_FALLBACK])].slice(0, QUICK_ROW_SIZE);

    return (
        <BottomSheet
            open={open}
            onOpenChange={onOpenChange}
            title={t('chat.room.messageActions')}
            description={t('chat.room.messageActionsDescription')}
            hideHeader
            showHandle
            className="rounded-t-[32px] pb-8"
        >
            {canReact && (
                <div className="flex items-center justify-between gap-1 px-4 pb-6 pt-8">
                    {quickEmojis.map(emoji => {
                        const mine = hasMyReaction(tallies, emoji);
                        return (
                            <button
                                key={emoji}
                                type="button"
                                onClick={() => onPickEmoji(emoji)}
                                aria-pressed={mine}
                                aria-label={t('chat.room.reactWith', { emoji })}
                                className={cn(
                                    'flex size-10 shrink-0 items-center justify-center rounded-full border text-xl transition-colors',
                                    mine
                                        ? 'border-main-accent bg-main-accent/[0.06]'
                                        : 'border-transparent bg-input-border/[0.44] active:bg-input-border/70'
                                )}
                            >
                                {emoji}
                            </button>
                        );
                    })}
                    <button
                        type="button"
                        onClick={onMoreEmoji}
                        aria-label={t('chat.room.moreEmoji')}
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-input-border/[0.44] text-foreground transition-colors active:bg-input-border/70"
                    >
                        <IconEmojiAdd size={20} />
                    </button>
                </div>
            )}

            {canReply && (
                <SheetAction icon={<IconThread size={26} />} label={t('chat.thread.replyAction')} onClick={onReply} />
            )}
            {hasText && (
                <SheetAction
                    icon={
                        isCopying ? (
                            <IconSpinner size={20} className="animate-spin text-muted-foreground" />
                        ) : (
                            <IconCopy size={22} />
                        )
                    }
                    label={t('chat.room.copyMessage')}
                    disabled={isCopying}
                    onClick={onCopy}
                />
            )}
            {audioFile && (
                <>
                    <SheetAction
                        icon={<IconDownload size={22} />}
                        label={t('chat.attach.audio.save')}
                        onClick={() => {
                            void files.download(audioFile);
                            onOpenChange(false);
                        }}
                    />
                    {canShareFiles && (
                        <SheetAction
                            icon={<Share size={22} />}
                            label={t('chat.attach.audio.share')}
                            onClick={() => {
                                void files.share(audioFile);
                                onOpenChange(false);
                            }}
                        />
                    )}
                </>
            )}
            {canModify && (
                <>
                    {hasText && (
                        <SheetAction icon={<Pencil size={22} />} label={t('chat.room.editMessage')} onClick={onEdit} />
                    )}
                    <SheetAction
                        icon={<Trash2 size={22} className="text-destructive" />}
                        label={t('chat.room.deleteMessage')}
                        onClick={onDelete}
                    />
                </>
            )}
            {sharedFile && (
                <SheetAction
                    icon={<Share size={22} />}
                    label={t('chat.attach.fileCard.share')}
                    onClick={() => {
                        void files.share(sharedFile);
                        onOpenChange(false);
                    }}
                />
            )}
        </BottomSheet>
    );
};
