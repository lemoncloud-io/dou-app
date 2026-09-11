import { useTranslation } from 'react-i18next';

import { X } from 'lucide-react';

import { cn } from '@chatic/lib/utils';

import type { ComposerAttachment } from '../../hooks';
import { ImageSpinner } from './ImageSpinner';

interface ComposerAttachmentsProps {
    attachments: ComposerAttachment[];
    onRemove: (id: string) => void;
}

/**
 * The tray of picked images inside the composer (Figma "이미지"): 92px tiles, a spinner
 * while one is still loading, and the remove "×" on hover or focus ("호버 시 삭제 버튼").
 */
export const ComposerAttachments = ({ attachments, onRemove }: ComposerAttachmentsProps) => {
    const { t } = useTranslation();
    if (attachments.length === 0) return null;
    return (
        <ul aria-label={t('chat.attach.tray')} className="flex flex-wrap gap-3.5 py-1">
            {attachments.map(attachment => (
                <li key={attachment.id} className="group/att relative h-[92px] w-[92px] shrink-0">
                    <div className="h-full w-full overflow-hidden rounded-2xl border border-hairline bg-muted">
                        <img
                            src={attachment.url}
                            alt={attachment.name}
                            draggable={false}
                            className={cn('h-full w-full object-cover', attachment.isUploading && 'blur-[1px]')}
                        />
                        {attachment.isUploading && (
                            <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40">
                                <ImageSpinner className="h-5 w-5 border-2" />
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => onRemove(attachment.id)}
                        aria-label={t('chat.attach.remove', { name: attachment.name })}
                        title={t('chat.attach.remove', { name: attachment.name })}
                        className="focus-ring absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border border-[#F4F5F5] bg-[#222325] text-white opacity-0 transition-opacity focus-visible:opacity-100 group-hover/att:opacity-100"
                    >
                        <X size={14} aria-hidden />
                    </button>
                </li>
            ))}
        </ul>
    );
};
