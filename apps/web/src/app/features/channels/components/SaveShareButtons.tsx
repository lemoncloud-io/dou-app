import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Images, Share } from 'lucide-react';

import { BottomSheet, ImageViewerActionButton, SheetAction } from '@chatic/web-ui-kit';

import { isExportableUrl, type ExportableImage, type ImageExportBusy } from '../hooks/useImageExports';
import type { ImageExportAction } from '../lib/imageExport';

interface SaveShareButtonsProps {
    image: ExportableImage;
    busy: ImageExportBusy | undefined;
    onAction: (action: ImageExportAction, image: ExportableImage) => void;
    /**
     * The message has more than one image to save: saving asks first whether to save this one or
     * all of them. `count` is how many the shell can fetch — photos still on their way are not.
     */
    saveAll?: { count: number; onSaveAll: () => void };
}

/**
 * The viewer's share and save for the showing image, at the two ends of its bottom bar. Both are
 * off for a photo still on its way (its address is a page-local preview) and while either is working
 * on this image.
 */
export const SaveShareButtons = ({ image, busy, onAction, saveAll }: SaveShareButtonsProps) => {
    const { t } = useTranslation();
    // The image the sheet was opened for, held so a page turned behind the sheet does not change it.
    const [choosing, setChoosing] = useState<ExportableImage | null>(null);
    const disabled = !isExportableUrl(image.url) || !!busy;
    const save = () => {
        if (saveAll && saveAll.count > 1) setChoosing(image);
        else onAction('save', image);
    };
    return (
        <>
            <ImageViewerActionButton
                label={t('chat.attach.export.share')}
                onClick={() => onAction('share', image)}
                disabled={disabled}
                busy={busy?.action === 'share'}
                progress={busy?.action === 'share' ? busy.progress : null}
            >
                <Share className="size-5" aria-hidden="true" />
            </ImageViewerActionButton>
            <ImageViewerActionButton
                label={t('chat.attach.export.save')}
                onClick={save}
                disabled={disabled}
                busy={busy?.action === 'save'}
                progress={busy?.action === 'save' ? busy.progress : null}
            >
                <Download className="size-5" aria-hidden="true" />
            </ImageViewerActionButton>
            {saveAll && (
                <BottomSheet
                    open={choosing !== null}
                    onOpenChange={open => {
                        if (!open) setChoosing(null);
                    }}
                    title={t('chat.attach.export.chooseTitle')}
                    description={t('chat.attach.export.chooseDescription')}
                    hideHeader
                    showHandle
                    className="pb-8"
                >
                    <div className="pt-6">
                        <SheetAction
                            icon={<Download size={22} aria-hidden="true" />}
                            label={t('chat.attach.export.saveOne')}
                            onClick={() => {
                                if (choosing) onAction('save', choosing);
                                setChoosing(null);
                            }}
                        />
                        <SheetAction
                            icon={<Images size={22} aria-hidden="true" />}
                            label={t('chat.attach.export.saveAll', { n: saveAll.count })}
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
