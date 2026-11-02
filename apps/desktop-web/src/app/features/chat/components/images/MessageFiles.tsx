import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertCircle, Download, FileText, Film, Pause, Play } from 'lucide-react';

import type { DomainChat } from '@chatic/data';

import { canPreview, downloadImage, formatFileSize, formatPlaybackTime, toChatFiles, type ChatFile } from '../../utils';
import { FileViewer } from './FileViewer';
import { ImageSpinner } from './ImageSpinner';
import type { ImageAuthor } from './ImageViewer';
import { useInlineAudio } from './useInlineAudio';
import { Hint, toastFailure } from '../../../../shared';

interface MessageFilesProps {
    /** The message the files belong to — they are read from its `upload$$`. */
    message: Pick<DomainChat, 'id' | 'upload$$'>;
    /** The message's sender and time, for the viewer's header. */
    author: ImageAuthor;
}

/**
 * A message's videos and documents, under its images. A video plays in place; a document is a card
 * with its name, size and a save button; a PDF or text file also opens in the viewer, and a voice file
 * plays in its card. Neither is drawn as an image tile: a PDF in an `<img>` is a broken picture.
 */
export const MessageFiles = ({ message, author }: MessageFilesProps) => {
    const { id, upload$$ } = message;
    const files = useMemo(() => (id && upload$$?.length ? toChatFiles(id, upload$$) : []), [id, upload$$]);
    if (files.length === 0) return null;
    return (
        <ul className="mt-2 flex max-w-[368px] flex-col gap-2">
            {files.map(file => (
                <li key={file.id}>
                    <FileItem file={file} author={author} />
                </li>
            ))}
        </ul>
    );
};

const FileItem = ({ file, author }: { file: ChatFile; author: ImageAuthor }) => {
    const { t } = useTranslation();
    const name = file.name ?? t(file.kind === 'video' ? 'chat.attach.previewVideo' : 'chat.attach.previewFile');
    // Saved as "file", not the reader's label; the save adds the extension the bytes have.
    const saveName = file.name ?? 'file';
    const KindIcon = file.kind === 'video' ? Film : FileText;
    const canSave = !!file.url;
    const preview = canPreview(file);
    const canOpen = preview !== null;
    const [isViewing, setIsViewing] = useState(false);
    const save = () =>
        void downloadImage({ url: file.url, name: saveName }).catch((error: unknown) =>
            toastFailure(t('chat.file.saveFailed'), error)
        );
    const saveButton = canSave && <SaveButton name={name} onSave={save} />;

    if (preview === 'audio') return <AudioCard src={file.url} name={name} saveButton={saveButton} />;

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

/**
 * A voice file's card, played where it is: the kind icon becomes play/pause and the size line a seek
 * bar with the clock. It used to open the document viewer — a full-window dialog around one small
 * native player, a lot of window for a two-second clip.
 */
const AudioCard = ({ src, name, saveButton }: { src: string; name: string; saveButton: ReactNode }) => {
    const { t } = useTranslation();
    const { audioProps, playing, time, duration, failed, toggle, seek } = useInlineAudio(src);
    // A length still unknown (or zero) is a bar at rest: nothing to seek through yet.
    const max = duration || 1;
    const position = duration ? Math.min(time, duration) : 0;
    // A file whose header names no length reads only the time played, not "0:12 / 0:00".
    const clock =
        duration === undefined
            ? formatPlaybackTime(time)
            : `${formatPlaybackTime(time)} / ${formatPlaybackTime(duration)}`;

    return (
        <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-muted px-3 py-2.5">
            <audio {...audioProps} />
            <button
                type="button"
                onClick={toggle}
                disabled={failed}
                aria-label={t(playing ? 'chat.file.pause' : 'chat.file.play', { name })}
                className="focus-ring tactile flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-opacity ease-tactile disabled:opacity-40"
            >
                {playing ? (
                    <Pause size={16} aria-hidden fill="currentColor" />
                ) : (
                    // The triangle's weight sits left of its box; a pixel right centres it by eye.
                    <Play size={16} aria-hidden fill="currentColor" className="translate-x-px" />
                )}
            </button>
            <div className="min-w-0 flex-1">
                <p className="truncate text-callout font-medium text-foreground">{name}</p>
                {failed ? (
                    <p className="text-caption text-destructive">{t('chat.file.playFailed')}</p>
                ) : (
                    <div className="flex items-center gap-2">
                        <input
                            type="range"
                            min={0}
                            max={max}
                            step="any"
                            value={position}
                            disabled={!duration}
                            onChange={event => seek(event.currentTarget.valueAsNumber)}
                            aria-label={t('chat.file.seek', { name })}
                            aria-valuetext={clock}
                            style={
                                {
                                    '--seek-progress': `${(position / max) * 100}%`,
                                } as CSSProperties
                            }
                            className="seek-slider focus-ring min-w-0 flex-1 cursor-pointer disabled:cursor-default"
                        />
                        <span className="shrink-0 text-caption tabular-nums text-muted-foreground">{clock}</span>
                    </div>
                )}
            </div>
            {saveButton}
        </div>
    );
};
