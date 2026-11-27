import * as React from 'react';

import { cn } from '@chatic/ui-kit';
import { useToastLift } from '@chatic/ui-kit/components/ui/toaster';

import {
    IconCameraSolid,
    IconFileSolid,
    IconGalleryWideSolid,
    IconMicrophoneSolid,
} from '@chatic/design-system-assets/icons';
import { SLIDE_MOTION, useSlidePresence } from '@chatic/design-system-patterns-mobile';
import { AttachActionTile } from './AttachActionTile';

export interface AttachPanelLabels {
    photo: string;
    camera: string;
    file: string;
    voice: string;
    title: string;
}

export interface AttachPanelProps {
    open: boolean;
    height: number;
    recent?: React.ReactNode;
    recentEmpty?: boolean;
    onPhoto: () => void;
    onCamera: () => void;
    onFile?: () => void;
    onVoice?: () => void;
    onClose: () => void;
    enter?: 'slide' | 'instant';
    exit?: 'slide' | 'instant';
    onTransitionEnd?: (state: 'open' | 'closed') => void;
    motion?: 'self' | 'external';
    labels?: Partial<AttachPanelLabels>;
    className?: string;
}

export interface AttachPanelHandle {
    readonly surface: HTMLDivElement | null;
    settle: () => void;
}

const DEFAULT_LABELS: AttachPanelLabels = {
    photo: 'Photos',
    camera: 'Camera',
    file: 'Files',
    voice: 'Voice',
    title: 'Attach',
};

const OPEN_OVERLAY =
    '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [data-state="open"][role="menu"], [data-state="open"][role="listbox"]';

const isTopmostOverlay = (element: Element) => {
    const open = element.ownerDocument.querySelectorAll(OPEN_OVERLAY);
    return open[open.length - 1] === element;
};

export const AttachPanel = React.forwardRef<AttachPanelHandle, AttachPanelProps>(
    (
        {
            open,
            height,
            recent,
            recentEmpty = false,
            onPhoto,
            onCamera,
            onFile,
            onVoice,
            onClose,
            enter = 'slide',
            exit = 'slide',
            onTransitionEnd: onSettled,
            motion = 'self',
            labels,
            className,
        },
        handleRef
    ) => {
        const text = { ...DEFAULT_LABELS, ...labels };
        const { mounted, shown, instant, ref, onTransitionEnd, finish } = useSlidePresence<HTMLDivElement>(open, {
            enter,
            exit,
            motion,
            onSettled,
        });
        React.useImperativeHandle(
            handleRef,
            () => ({
                get surface() {
                    return ref.current;
                },
                settle: finish,
            }),
            [ref, finish]
        );
        useToastLift(open ? height : null);

        const closeRef = React.useRef(onClose);
        closeRef.current = onClose;
        React.useEffect(() => {
            if (!open) return undefined;
            const onKeyDown = (event: KeyboardEvent) => {
                if (event.key !== 'Escape' || event.defaultPrevented) return;
                const panel = ref.current;
                if (!panel || !isTopmostOverlay(panel)) return;
                event.preventDefault();
                closeRef.current();
            };
            document.addEventListener('keydown', onKeyDown);
            return () => document.removeEventListener('keydown', onKeyDown);
        }, [open, ref]);

        if (!mounted) return null;
        return (
            <div
                ref={ref}
                role="dialog"
                aria-modal="false"
                aria-label={text.title}
                data-state={open ? 'open' : 'closed'}
                inert={!open}
                onTransitionEnd={onTransitionEnd}
                style={{ height: `calc(${height}px + var(--safe-bottom, 0px))` }}
                className={cn(
                    'absolute inset-x-0 bottom-0 z-30 flex flex-col rounded-t-[20px] bg-surface pb-[var(--safe-bottom,0px)] shadow-[0_-2px_6px_rgba(0,0,0,0.12)]',
                    instant || motion === 'external' ? 'transition-none' : SLIDE_MOTION,
                    shown ? 'translate-y-0' : 'translate-y-full',
                    className
                )}
            >
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain pb-8">
                    {recent}
                    <div
                        data-testid="attach-entries"
                        className={cn(
                            'flex w-full shrink-0 justify-center gap-6',
                            recent && !recentEmpty ? 'pt-6' : 'my-auto pt-8'
                        )}
                    >
                        <AttachActionTile
                            icon={<IconGalleryWideSolid className="text-glyph-green" />}
                            label={text.photo}
                            onClick={onPhoto}
                        />
                        <AttachActionTile
                            icon={<IconCameraSolid className="text-glyph-indigo" />}
                            label={text.camera}
                            onClick={onCamera}
                        />
                        {onFile && (
                            <AttachActionTile
                                icon={<IconFileSolid className="text-glyph-cyan" />}
                                label={text.file}
                                onClick={onFile}
                            />
                        )}
                        {onVoice && (
                            <AttachActionTile
                                icon={<IconMicrophoneSolid className="text-destructive" />}
                                label={text.voice}
                                onClick={onVoice}
                            />
                        )}
                    </div>
                </div>
            </div>
        );
    }
);
AttachPanel.displayName = 'AttachPanel';
