import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertCircle, ChevronDown, Download, FileText, Film } from 'lucide-react';

import type { DomainChat } from '@chatic/data';
import { cn } from '@chatic/lib/utils';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import {
    canPreview,
    downloadImage,
    downloadImages,
    formatFileSize,
    isVoiceFile,
    toChatFiles,
    type ChatFile,
} from '../../utils';
import { CancelUploadButton } from './CancelUploadButton';
import { DeleteFileConfirm } from './DeleteFileConfirm';
import { FileViewer } from './FileViewer';
import { ImageSpinner } from './ImageSpinner';
import type { ImageAuthor } from './ImageViewer';
import { VoiceCard } from './VoiceCard';
import { useVoiceDetailStore } from './VoiceDetailHost';
import { Hint, toastFailure } from '../../../../shared';

interface MessageFilesProps {
    /** The message the files belong to — they are read from its `upload$$`. */
    message: Pick<DomainChat, 'id' | 'upload$$'>;
    /** The message's sender and time, for the viewer's header. */
    author: ImageAuthor;
    /** "Delete file" is offered on your own messages only. */
    canDelete?: boolean;
    /**
     * Deletes the whole message. A sent upload has no delete of its own on the server, so "Delete file"
     * on a voice file removes the message it came with, as it does for an image.
     */
    onDeleteMessage?: () => void;
    /** Opens this message's thread. Absent inside the thread panel. */
    onReply?: () => void;
    /**
     * Takes the channel's feed to this message. Offered only where the feed can land it — the channel's
     * own feed — not in a thread, the threads page or Saved.
     */
    onShowInChat?: () => void;
    /** Stops the message's send while its files upload. Absent where it cannot be stopped. */
    onCancelUpload?: () => void;
}

/**
 * A message's videos and documents, under its images. A video plays in place; a document is a card
 * with its name, size and a save button; a PDF or text file also opens in the viewer, and a voice file
 * plays in its card. Neither is drawn as an image tile: a PDF in an `<img>` is a broken picture.
 *
 * Two or more are headed "n attachments ▾ | Download all" (Figma "음성 파일 · 데스크탑 ③"): the count folds
 * the list away, and the download saves every file there is something to load for, one after another.
 */
export const MessageFiles = ({
    message,
    author,
    canDelete,
    onDeleteMessage,
    onReply,
    onShowInChat,
    onCancelUpload,
}: MessageFilesProps) => {
    const { t } = useTranslation();
    const { id, upload$$ } = message;
    const files = useMemo(() => (id && upload$$?.length ? toChatFiles(id, upload$$) : []), [id, upload$$]);
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [isFolded, setFolded] = useState(false);
    const requestDelete = canDelete && onDeleteMessage ? () => setConfirmingDelete(true) : undefined;
    if (files.length === 0) return null;
    const listId = `files-${id}`;
    const downloadAll = () =>
        downloadImages(
            files.filter(file => file.url).map(file => ({ url: file.url, name: file.name ?? 'file' })),
            () => toast({ variant: 'destructive', description: t('chat.file.saveFailed') })
        );
    return (
        <>
            {files.length > 1 && (
                <div className="mt-2 flex items-center gap-2 text-caption text-muted-foreground">
                    <button
                        type="button"
                        onClick={() => setFolded(folded => !folded)}
                        aria-expanded={!isFolded}
                        aria-controls={listId}
                        className="focus-ring tactile flex items-center gap-0.5 rounded-sm hover:text-foreground"
                    >
                        {t('chat.file.groupTitle', { count: files.length })}
                        <ChevronDown
                            size={14}
                            aria-hidden
                            className={cn('transition-transform ease-tactile', isFolded && '-rotate-90')}
                        />
                    </button>
                    <span aria-hidden className="h-3 w-px bg-hairline" />
                    <button
                        type="button"
                        onClick={downloadAll}
                        className="focus-ring tactile flex items-center gap-1 rounded-sm hover:text-foreground"
                    >
                        <Download size={13} aria-hidden />
                        {t('chat.image.downloadAll')}
                    </button>
                </div>
            )}
            {/* `flex` only while open: a utility's display beats the `[hidden]` reset, so the two together
                never fold. */}
            <ul id={listId} hidden={isFolded} className={cn('mt-2 max-w-[368px] flex-col gap-2', !isFolded && 'flex')}>
                {files.map(file => (
                    <li key={file.id}>
                        <FileItem
                            file={file}
                            author={author}
                            messageId={id}
                            onReply={onReply}
                            onDelete={requestDelete}
                            deleteMessage={canDelete ? onDeleteMessage : undefined}
                            onShowInChat={onShowInChat}
                            onCancelUpload={onCancelUpload}
                        />
                    </li>
                ))}
            </ul>
            {confirmingDelete && (
                <DeleteFileConfirm
                    onCancel={() => setConfirmingDelete(false)}
                    onConfirm={() => {
                        setConfirmingDelete(false);
                        onDeleteMessage?.();
                    }}
                />
            )}
        </>
    );
};

const FileItem = ({
    file,
    author,
    messageId,
    onReply,
    onDelete,
    deleteMessage,
    onShowInChat,
    onCancelUpload,
}: {
    file: ChatFile;
    author: ImageAuthor;
    messageId: string | undefined;
    onReply?: () => void;
    /** Asks this row's confirm, then deletes. */
    onDelete?: () => void;
    /**
     * Deletes the message without asking. The detail dialog takes this one and its host asks: the
     * dialog outlives the row, and the row's confirm goes with the row.
     */
    deleteMessage?: () => void;
    onShowInChat?: () => void;
    onCancelUpload?: () => void;
}) => {
    const { t } = useTranslation();
    const name = file.name ?? t(file.kind === 'video' ? 'chat.attach.previewVideo' : 'chat.attach.previewFile');
    // Saved as "file", not the reader's label; the save adds the extension the bytes have.
    const saveName = file.name ?? 'file';
    const KindIcon = file.kind === 'video' ? Film : FileText;
    const canSave = !!file.url;
    const preview = canPreview(file);
    const canOpen = preview !== null;
    const [isViewing, setIsViewing] = useState(false);
    const openDetail = useVoiceDetailStore(s => s.open);
    const save = () =>
        void downloadImage({ url: file.url, name: saveName }).catch((error: unknown) =>
            toastFailure(t('chat.file.saveFailed'), error)
        );
    const saveButton = canSave && <SaveButton name={name} onSave={save} />;

    if (isVoiceFile(file)) {
        return (
            <VoiceCard
                file={file}
                name={name}
                messageId={messageId}
                onSave={save}
                onReply={onReply}
                onDelete={onDelete}
                onCancelUpload={onCancelUpload}
                onOpen={
                    file.url
                        ? () =>
                              openDetail({
                                  src: file.url,
                                  name,
                                  size: file.size,
                                  author,
                                  onSave: save,
                                  onShowInChat,
                                  onReply,
                                  onDelete: deleteMessage,
                              })
                        : undefined
                }
            />
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {file.kind === 'video' && canSave && (
                // The original is signed for inline viewing, and Chromium plays an H.264 MP4 itself.
                <video
                    src={file.url}
                    controls
                    preload="metadata"
                    className="max-h-[240px] w-full rounded-2xl border border-hairline bg-black"
                />
            )}
            <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-muted px-3 py-2.5">
                <KindIcon size={20} aria-hidden className="shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                    {canOpen ? (
                        <button
                            type="button"
                            onClick={() => setIsViewing(true)}
                            aria-label={t('chat.file.open', { name })}
                            className="focus-ring block max-w-full truncate rounded-sm text-left text-callout font-medium text-foreground hover:underline"
                        >
                            {name}
                        </button>
                    ) : (
                        <p className="truncate text-callout font-medium text-foreground">{name}</p>
                    )}
                    {file.isFailed ? (
                        <p className="text-caption text-destructive">{t('chat.file.failed')}</p>
                    ) : (
                        file.size !== undefined && (
                            <p className="text-caption tabular-nums text-muted-foreground">
                                {formatFileSize(file.size)}
                            </p>
                        )
                    )}
                </div>
                {file.isUploading && (
                    <span role="status" aria-label={t('chat.file.uploading', { name })} className="shrink-0">
                        <ImageSpinner className="h-5 w-5 border-2" />
                    </span>
                )}
                {file.isUploading && onCancelUpload && <CancelUploadButton name={name} onCancel={onCancelUpload} />}
                {file.isFailed && <AlertCircle size={18} aria-hidden className="shrink-0 text-destructive" />}
                {saveButton}
            </div>
            {isViewing && <FileViewer file={file} author={author} onClose={() => setIsViewing(false)} onSave={save} />}
        </div>
    );
};

const SaveButton = ({ name, onSave }: { name: string; onSave: () => void }) => {
    const { t } = useTranslation();
    return (
        <Hint label={t('chat.file.save', { name })}>
            <button
                type="button"
                onClick={onSave}
                aria-label={t('chat.file.save', { name })}
                className="focus-ring tactile hit-target flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground transition-colors ease-tactile hover:bg-accent"
            >
                <Download size={18} aria-hidden />
            </button>
        </Hint>
    );
};
