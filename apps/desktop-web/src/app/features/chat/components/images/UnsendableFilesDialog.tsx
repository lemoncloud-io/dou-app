import { useEffect } from 'react';
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
} from '@chatic/ui-kit';

import { useUnsendableFilesStore, type RefusedFile } from '../../hooks';
import { formatFileSize } from '../../utils';
import { FileName } from './FileName';

export const UnsendableFilesHost = () => {
    const { t } = useTranslation();
    const request = useUnsendableFilesStore(s => s.request);
    const close = useUnsendableFilesStore(s => s.close);
    useEffect(() => close, [close]);
    if (!request) return null;
    const { refused, restCount, onUploadRest } = request;
    const hasUnsupported = refused.some(file => file.reason === 'unsupported');

    return (
        <AlertDialog open onOpenChange={open => !open && close()}>
            <AlertDialogContent className="sm:max-w-md">
                <AlertDialogTitle>{t('chat.attach.refused.title')}</AlertDialogTitle>
                <AlertDialogDescription>{t('chat.attach.refused.description')}</AlertDialogDescription>
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
