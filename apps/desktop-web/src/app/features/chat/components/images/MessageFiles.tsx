import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { format } from 'date-fns';

import { AlertCircle, ChevronDown, Download, FileText, Film } from 'lucide-react';

import type { DomainChat } from '@chatic/runtime';
import { cn, toast } from '@chatic/ui-kit';

import {
    canPreview,
    downloadAsZip,
    downloadImage,
    downloadImages,
    fetchFileBytes,
    fitsInZip,
    formatFileSize,
    isVoiceFile,
    toChatFiles,
    type ChatFile,
} from '../../utils';
import { CancelUploadButton } from './CancelUploadButton';
import { DeleteFileConfirm } from './DeleteFileConfirm';
import { FileActions } from './FileActions';
import { FileViewer } from './FileViewer';
import { useForwardFileStore } from './ForwardFileDialog';
import { ImageSpinner } from './ImageSpinner';
import type { ImageAuthor } from './ImageViewer';
import { useCopyMessageLink } from './useCopyMessageLink';
import { VoiceCard } from './VoiceCard';
import { useVoiceDetailStore } from './VoiceDetailHost';
import { useFreshAddress, useImageAddressRefresh, useRunWithFreshAddress } from '../../hooks';
import { toastFailure } from '../../../../shared';

interface MessageFilesProps {
    message: Pick<DomainChat, 'id' | 'upload$$' | 'chatNo' | 'channelId' | 'parentId'>;
    author: ImageAuthor;
    canDelete?: boolean;
    onDeleteMessage?: () => void;
    onReply?: () => void;
    onShowInChat?: () => void;
    onCancelUpload?: () => void;
}

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
    const [isZipping, setZipping] = useState(false);
    const requestDelete = canDelete && onDeleteMessage ? () => setConfirmingDelete(true) : undefined;
    const copyLink = useCopyMessageLink(message);
    const runWithFreshAddress = useRunWithFreshAddress();
    if (files.length === 0) return null;
    const listId = `files-${id}`;
    const saveFailed = () => toast({ variant: 'destructive', description: t('chat.file.saveFailed') });
    const withFreshUrl = <T,>(file: { id: string; url: string }, run: (url: string) => Promise<T>) =>
        runWithFreshAddress({ chatId: id, id: file.id, url: file.url }, run);
    const downloadAll = async () => {
        const loadable = files
            .filter(file => file.url)
            .map(file => ({ id: file.id, url: file.url, name: file.name ?? 'file', size: file.size }));
        if (!fitsInZip(loadable)) {
            downloadImages(loadable, saveFailed, file => withFreshUrl(file, url => downloadImage({ ...file, url })));
            return;
        }
        setZipping(true);
        try {
            const { saved, failed } = await downloadAsZip(
                loadable,
                t('chat.file.zipName', { date: format(new Date(), 'yyyy-MM-dd') }),
                file => withFreshUrl(file, fetchFileBytes)
            );
            if (saved === 0) saveFailed();
            else if (failed > 0) toast({ variant: 'destructive', description: t('chat.file.zipPartial') });
        } catch {
            saveFailed();
        } finally {
            setZipping(false);
        }
    };
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
                        onClick={() => void downloadAll()}
                        disabled={isZipping}
                        aria-busy={isZipping}
                        className="focus-ring tactile flex items-center gap-1 rounded-sm hover:text-foreground disabled:opacity-60"
                    >
                        <Download size={13} aria-hidden />
                        {t(isZipping ? 'chat.file.zipping' : 'chat.image.downloadAll')}
                    </button>
                </div>
            )}
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
                            onCopyLink={copyLink}
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
    onCopyLink,
}: {
    file: ChatFile;
    author: ImageAuthor;
    messageId: string | undefined;
    onReply?: () => void;
    onDelete?: () => void;
    deleteMessage?: () => void;
    onShowInChat?: () => void;
    onCancelUpload?: () => void;
    onCopyLink?: () => void;
}) => {
    const { t } = useTranslation();
    const name = file.name ?? t(file.kind === 'video' ? 'chat.attach.previewVideo' : 'chat.attach.previewFile');
    const saveName = file.name ?? 'file';
    const KindIcon = file.kind === 'video' ? Film : FileText;
    const canSave = !!file.url;
    const preview = canPreview(file);
    const canOpen = preview !== null;
    const [isViewing, setIsViewing] = useState(false);
    const openDetail = useVoiceDetailStore(s => s.open);
    const openForward = useForwardFileStore(s => s.open);
    const refreshAddress = useImageAddressRefresh();
    const freshAddress = useFreshAddress();
    const runWithFreshAddress = useRunWithFreshAddress();
    const onLoadError = useCallback((src: string) => void refreshAddress(messageId, src), [messageId, refreshAddress]);
    const forward = file.url
        ? () =>
              openForward({
                  url: file.url,
                  name: saveName,
                  ...(file.contentType ? { contentType: file.contentType } : {}),
                  refreshUrl: () => freshAddress(messageId, file.id),
              })
        : undefined;
    const save = () =>
        void runWithFreshAddress({ chatId: messageId, id: file.id, url: file.url }, url =>
            downloadImage({ url, name: saveName })
        ).catch((error: unknown) => toastFailure(t('chat.file.saveFailed'), error));

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
                onCopyLink={onCopyLink}
                onForward={forward}
                onLoadError={onLoadError}
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
                                  onCopyLink,
                                  onForward: forward,
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
                <video
                    src={file.url}
                    controls
                    preload="metadata"
                    onError={() => onLoadError(file.url)}
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
                {canSave && (
                    <FileActions
                        name={name}
                        onSave={save}
                        onReply={onReply}
                        onDelete={onDelete}
                        onCopyLink={onCopyLink}
                        onForward={forward}
                    />
                )}
            </div>
            {isViewing && (
                <FileViewer
                    file={file}
                    author={author}
                    onClose={() => setIsViewing(false)}
                    onSave={save}
                    onLoadError={onLoadError}
                />
            )}
        </div>
    );
};
