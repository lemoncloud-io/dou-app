import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { File as FileIcon, Plus } from 'lucide-react';

import { cn } from '@chatic/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@chatic/ui-kit/components/ui/popover';

import { SUPPORTED_IMAGE_TYPES } from '../../utils';
import { FLOATING_MENU_SURFACE } from './imageStyles';
import { Hint } from '../../../../shared';

interface AttachMenuProps {
    onFiles: (files: File[]) => void;
}

/**
 * The composer's "+" (Figma): a small menu with one entry, "사진 및 파일 추가 · 컴퓨터에서
 * 업로드 하세요", which opens the OS picker. Unsupported picks still go through the
 * tray's validation so they get the same notice a drop would.
 */
export const AttachMenu = ({ onFiles }: AttachMenuProps) => {
    const { t } = useTranslation();
    const [isOpen, setOpen] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    return (
        <Popover open={isOpen} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Hint label={t('chat.attach.add')}>
                    <button
                        type="button"
                        aria-label={t('chat.attach.add')}
                        // mousedown default kept off so the editor keeps its caret.
                        onMouseDown={event => event.preventDefault()}
                        className="focus-ring tactile flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors ease-tactile hover:bg-accent aria-expanded:bg-accent"
                    >
                        <Plus size={18} aria-hidden />
                    </button>
                </Hint>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" sideOffset={10} className={cn('w-auto', FLOATING_MENU_SURFACE)}>
                <button
                    type="button"
                    onClick={() => {
                        setOpen(false);
                        inputRef.current?.click();
                    }}
                    className="flex w-full flex-col items-start gap-2 rounded-[10px] px-3 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
                >
                    <span className="flex items-center gap-2 text-[14px] font-medium tracking-[-0.01em] text-foreground">
                        <FileIcon size={18} aria-hidden />
                        {t('chat.attach.menuTitle')}
                    </span>
                    <span className="text-[13px] tracking-[-0.01em] text-placeholder">{t('chat.attach.menuHint')}</span>
                </button>
            </PopoverContent>
            <input
                ref={inputRef}
                type="file"
                multiple
                accept={SUPPORTED_IMAGE_TYPES.join(',')}
                className="hidden"
                onChange={event => {
                    const files = Array.from(event.target.files ?? []);
                    // Reset so picking the same file again still fires change (and meets the duplicate notice).
                    event.target.value = '';
                    if (files.length > 0) onFiles(files);
                }}
            />
        </Popover>
    );
};
