import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Images, Share } from 'lucide-react';

import { BottomSheet, MediaViewerActionButton, SheetAction } from '@chatic/web-ui-kit';

import { isExportableUrl, type ExportableMedia, type MediaExportBusy } from '../hooks/useImageExports';
import type { MediaExportAction } from '../lib/imageExport';

interface SaveShareButtonsProps {
    item: ExportableMedia;
    busy: MediaExportBusy | undefined;
    onAction: (action: MediaExportAction, item: ExportableMedia) => void;
    saveAll?: { count: number; videos: boolean; onSaveAll: () => void };
    canShare?: boolean;
}

export const SaveShareButtons = ({ item, busy, onAction, saveAll, canShare = true }: SaveShareButtonsProps) => {
    const { t } = useTranslation();
    const [choosing, setChoosing] = useState<ExportableMedia | null>(null);
    const disabled = !isExportableUrl(item.url) || !!item.broken || !!busy;
    const video = item.kind === 'video';
    const save = () => {
        if (saveAll && saveAll.count > 1) setChoosing(item);
        else onAction('save', item);
    };
    return (
        <>
            {canShare ? (
                <MediaViewerActionButton
                    label={t(video ? 'chat.attach.export.shareVideo' : 'chat.attach.export.share')}
                    onClick={() => onAction('share', item)}
                    disabled={disabled}
                    busy={busy?.action === 'share'}
                    progress={busy?.action === 'share' ? busy.progress : null}
                >
                    <Share className="size-5" aria-hidden="true" />
                </MediaViewerActionButton>
            ) : (
                <span aria-hidden="true" />
            )}
            {busy?.step && (
                <span role="status" className="text-sm tabular-nums text-white">
                    {t('chat.attach.export.saveAllProgress', busy.step)}
                </span>
            )}
            <MediaViewerActionButton
                label={t(video ? 'chat.attach.export.saveVideo' : 'chat.attach.export.save')}
                onClick={save}
                disabled={disabled}
                busy={busy?.action === 'save'}
                progress={busy?.action === 'save' ? busy.progress : null}
            >
                <Download className="size-5" aria-hidden="true" />
            </MediaViewerActionButton>
            {saveAll && (
                <BottomSheet
                    open={choosing !== null}
                    onOpenChange={open => {
                        if (!open) setChoosing(null);
                    }}
                    title={t(saveAll.videos ? 'chat.attach.export.chooseTitleItems' : 'chat.attach.export.chooseTitle')}
                    description={t(
                        saveAll.videos
                            ? 'chat.attach.export.chooseDescriptionItems'
                            : 'chat.attach.export.chooseDescription'
                    )}
                    hideHeader
                    showHandle
                    className="pb-8"
                >
                    <div className="pt-6">
                        <SheetAction
                            icon={<Download size={22} aria-hidden="true" />}
                            label={t(
                                choosing?.kind === 'video'
                                    ? 'chat.attach.export.saveOneVideo'
                                    : 'chat.attach.export.saveOne'
                            )}
                            onClick={() => {
                                if (choosing) onAction('save', choosing);
                                setChoosing(null);
                            }}
                        />
                        <SheetAction
                            icon={<Images size={22} aria-hidden="true" />}
                            label={t(
                                saveAll.videos ? 'chat.attach.export.saveAllItems' : 'chat.attach.export.saveAll',
                                {
                                    n: saveAll.count,
                                }
                            )}
                            onClick={() => {
                                setChoosing(null);
                                saveAll.onSaveAll();
                            }}
                        />
                        <SheetAction label={t('chat.attach.export.cancel')} onClick={() => setChoosing(null)} />
                    </div>
                </BottomSheet>
            )}
        </>
    );
};
