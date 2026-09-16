import { useTranslation } from 'react-i18next';

import { FileCode2, FileText, Image } from 'lucide-react';

import { MAX_ATTACHMENTS } from '../../utils';

/**
 * The three fills of Figma's stacked-files mark ("#이미지 드래그 오버"). They are
 * illustration, not interface: the only place in the desktop client that carries a
 * hue other than the lime, and they stay fixed in both themes because the mark is
 * one drawing. Kept here rather than inline so the exception is countable.
 * The glyphs on the two light fills are dark, not white — white measured 1.4:1 on
 * the yellow and 2.1:1 on the green, i.e. the icons were invisible.
 */
const FILE_MARK = {
    code: 'bg-[#5BC77A] text-black/70',
    note: 'bg-[#F9D65C] text-black/70',
    image: 'bg-[#2E9BEA] text-white',
} as const;

/**
 * Shown over the conversation while files are dragged in (Figma "#이미지 드래그 오버"): a
 * dashed drop zone, the stacked-files mark, and the limit. Pointer-transparent, so the
 * drag events keep landing on the pane underneath.
 */
export const AttachmentDropOverlay = () => {
    const { t } = useTranslation();
    return (
        <div
            aria-hidden
            className="pointer-events-none absolute inset-x-6 bottom-5 top-4 z-30 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-description/60 bg-background/85 backdrop-blur-[2px] animate-fade-in"
        >
            {/* Figma's mark: a blue image card between a green code file and a yellow note. */}
            <span className="relative mb-2 h-[72px] w-[104px]">
                <span
                    className={`absolute left-1 top-0 flex h-11 w-9 -rotate-12 items-center justify-center rounded-lg ${FILE_MARK.code}`}
                >
                    <FileCode2 size={18} aria-hidden />
                </span>
                <span
                    className={`absolute right-1 top-3 flex h-11 w-9 rotate-12 items-center justify-center rounded-lg ${FILE_MARK.note}`}
                >
                    <FileText size={18} aria-hidden />
                </span>
                <span
                    className={`absolute left-1/2 top-4 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-xl ${FILE_MARK.image} shadow-raised`}
                >
                    <Image size={28} aria-hidden />
                </span>
            </span>
            <p className="text-[20px] font-semibold tracking-[-0.01em] text-foreground">{t('chat.attach.dropTitle')}</p>
            <p className="text-[14px] text-label">{t('chat.attach.dropHint', { count: MAX_ATTACHMENTS })}</p>
        </div>
    );
};
