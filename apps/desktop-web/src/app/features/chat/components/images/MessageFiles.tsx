import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertCircle, Download, FileText, Film } from 'lucide-react';

import type { DomainChat } from '@chatic/data';
import { toast } from '@chatic/ui-kit/components/ui/use-toast';

import { downloadImage, formatFileSize, toChatFiles, type ChatFile } from '../../utils';
import { ImageSpinner } from './ImageSpinner';
import { Hint } from '../../../../shared';

interface MessageFilesProps {
    /** The message the files belong to — they are read from its `upload$$`. */
    message: Pick<DomainChat, 'id' | 'upload$$'>;
}

/**
 * A message's videos and documents, under its images. A video plays in place; a document is a card
 * with its name, size and a save button. Neither is drawn as an image tile: a PDF in an `<img>` is a
 * broken picture.
 */
export const MessageFiles = ({ message }: MessageFilesProps) => {
    const { id, upload$$ } = message;
    const files = useMemo(() => (id && upload$$?.length ? toChatFiles(id, upload$$) : []), [id, upload$$]);
    if (files.length === 0) return null;
    return (
        <ul className="mt-2 flex max-w-[368px] flex-col gap-2">
            {files.map(file => (
                <li key={file.id}>
                    <FileItem file={file} />
                </li>
            ))}
        </ul>
    );
};

const FileItem = ({ file }: { file: ChatFile }) => {
    const { t } = useTranslation();
    const name = file.name ?? t(file.kind === 'video' ? 'chat.attach.previewVideo' : 'chat.attach.previewFile');
    // Saved as "file", not the reader's label; the save adds the extension the bytes have.
    const saveName = file.name ?? 'file';
    const KindIcon = file.kind === 'video' ? Film : FileText;
    const canSave = !!file.url;
    const save = () =>
        void downloadImage({ url: file.url, name: saveName }).catch(() =>
            toast({ variant: 'destructive', description: t('chat.file.saveFailed') })
        );

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
                    <p className="truncate text-callout font-medium text-foreground">{name}</p>
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
                {file.isFailed && <AlertCircle size={18} aria-hidden className="shrink-0 text-destructive" />}
                {canSave && (
                    <Hint label={t('chat.file.save', { name })}>
                        <button
                            type="button"
                            onClick={save}
                            aria-label={t('chat.file.save', { name })}
                            className="focus-ring tactile hit-target flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-foreground transition-colors ease-tactile hover:bg-accent"
                        >
                            <Download size={18} aria-hidden />
                        </button>
                    </Hint>
                )}
            </div>
        </div>
    );
};
