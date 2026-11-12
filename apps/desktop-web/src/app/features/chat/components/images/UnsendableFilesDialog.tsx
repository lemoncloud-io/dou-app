import { useTranslation } from 'react-i18next';

import type { TFunction } from 'i18next';

import { FileX } from 'lucide-react';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogTitle,
} from '@chatic/ui-kit/components/ui/alert-dialog';

import { useUnsendableFilesStore, type RefusedFile } from '../../hooks';
import { formatFileSize } from '../../utils';
import { FileName } from './FileName';

/**
 * "Some files can't be sent" (Figma "보낼 수 없는 파일"): every file a pick, drop or paste could not take,
 * each with why, and — when anything else fits — "Upload the other n" to add the rest, or Cancel to add
 * nothing. When nothing fits there is only OK. Mounted once beside the panes; the tray hook asks it.
 */
export const UnsendableFilesHost = () => {
    const { t } = useTranslation();
    const request = useUnsendableFilesStore(s => s.request);
    const close = useUnsendableFilesStore(s => s.close);
    if (!request) return null;
    const { refused, restCount, onUploadRest } = request;
    const hasUnsupported = refused.some(file => file.reason === 'unsupported');

    return (
        <AlertDialog open onOpenChange={open => !open && close()}>
            <AlertDialogContent className="sm:max-w-md">
                <AlertDialogTitle>{t('chat.attach.refused.title')}</AlertDialogTitle>
                <AlertDialogDescription>{t('chat.attach.refused.description')}</AlertDialogDescription>
                {/* Scrolls on its own: a drop of a hundred refused files keeps the buttons on screen. */}
                <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg bg-muted p-2">
                    {refused.map((file, index) => (
                        <li key={`${index}:${file.name}`} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                            <FileX size={16} aria-hidden className="shrink-0 text-muted-foreground" />
                            <div className="min-w-0 flex-1">
                                <FileName name={file.name} />
                                <p className="text-caption text-destructive">{reasonOf(file, t)}</p>
                            </div>
                        </li>
                    ))}
                </ul>
                {hasUnsupported && (
                    <p className="text-caption text-muted-foreground">{t('chat.attach.refused.formats')}</p>
                )}
                <AlertDialogFooter className="gap-2 pt-2 sm:space-x-0">
                    {onUploadRest ? (
                        <>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => {
                                    close();
                                    onUploadRest();
                                }}
                            >
                                {t('chat.attach.refused.uploadRest', { count: restCount })}
                            </AlertDialogAction>
                        </>
                    ) : (
                        <AlertDialogAction onClick={close}>{t('common.confirm')}</AlertDialogAction>
                    )}
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
};

const reasonOf = ({ reason, max }: RefusedFile, t: TFunction): string =>
    t(`chat.attach.refused.${reason}`, {
        max: reason === 'too-large' && max !== undefined ? formatFileSize(max) : max,
    });
