import * as Dialog from '@radix-ui/react-dialog';
import * as React from 'react';

import { cn } from '@chatic/ui-kit';
import { useToastLift } from '@chatic/ui-kit/components/ui/toaster';

import { IconAlert, IconClose, IconCrop, IconFlipHorizontal, IconRotateLeft, IconSpinner } from '../../resources/icons';
import { DRAG_SLOP_PX, isOwnEvent, pagerDragOffset, pagerReleaseStep, VIEWER_MOTION } from '../overlay/viewerShell';
import { EditedPhotoImage } from './EditedPhotoImage';
import {
    CROP_ASPECTS,
    flipPhotoEditHorizontal,
    IDENTITY_PHOTO_EDIT,
    isIdentityPhotoEdit,
    rotatePhotoEditLeft,
    setPhotoEditAspect,
    type CropAspect,
    type PhotoEdit,
} from './photoEdit';
import { PhotoCropStage } from './PhotoCropStage';
import type { PhotoItemKind } from './types';
import { useBoxSize } from './useBoxSize';
import { VideoMark } from './VideoMark';

export interface PhotoEditorItem {
    id: string;
    previewSrc: string;
    src?: string;
    width?: number;
    height?: number;
    edit?: PhotoEdit;
    editable: boolean;
    failed?: boolean;
    kind?: PhotoItemKind;
    durationMs?: number;
}

export interface PhotoEditorLabels {
    close: string;
    done: string;
    crop: string;
    rotateLeft: string;
    flip: string;
    reset: string;
    cancel: string;
    apply: string;
    aspects: Record<CropAspect, string>;
    notEditable: string;
    loading: string;
    failed: string;
    counter: (position: number, total: number) => string;
    thumbnail: (position: number) => string;
    title: string;
}

const DEFAULT_LABELS: PhotoEditorLabels = {
    close: 'Close',
    done: 'Done',
    crop: 'Crop & rotate',
    rotateLeft: 'Rotate left',
    flip: 'Flip',
    reset: 'Reset',
    cancel: 'Cancel',
    apply: 'Apply',
    aspects: {
        free: 'Free',
        original: 'Original',
        '1:1': '1:1',
        '4:3': '4:3',
        '3:4': '3:4',
        '16:9': '16:9',
        '9:16': '9:16',
    },
    notEditable: 'Videos and GIFs cannot be edited',
    loading: 'Loading the photo…',
    failed: 'This photo could not be loaded',
    counter: (position, total) => `${position} / ${total}`,
    thumbnail: position => `Photo ${position}`,
    title: 'Edit photos',
};

export interface PhotoEditorProps {
    open: boolean;
    items: PhotoEditorItem[];
    index: number;
    onIndexChange: (index: number) => void;
    onEditChange: (id: string, edit: PhotoEdit) => void;
    onCancel: () => void;
    onDone: () => void;
    onSend: () => void;
    sendLabel: string;
    sending?: boolean;
    labels?: Partial<PhotoEditorLabels>;
}

interface Press {
    pointerId: number;
    x: number;
    y: number;
    at: number;
    axis: 'x' | 'y' | null;
}

const isLoaded = (item: PhotoEditorItem): item is PhotoEditorItem & { src: string; width: number; height: number } =>
    Boolean(item.src && item.width && item.height && item.width > 0 && item.height > 0);

const canCrop = (
    item: PhotoEditorItem | undefined
): item is PhotoEditorItem & { src: string; width: number; height: number } =>
    Boolean(item && item.editable && !item.failed && isLoaded(item));

const statusOf = (item: PhotoEditorItem | undefined): 'failed' | 'notEditable' | 'loading' | null => {
    if (!item) return null;
    if (item.failed) return 'failed';
    if (!item.editable) return 'notEditable';
    return isLoaded(item) ? null : 'loading';
};

const isEdited = (item: PhotoEditorItem) => !isIdentityPhotoEdit(item.edit);

const HEADER_TEXT_BUTTON =
    'flex h-9 items-center rounded-full px-2 text-[16px] font-semibold leading-none text-white disabled:opacity-40';
const TOOL_ICON_BUTTON =
    'flex size-11 items-center justify-center rounded-full text-white transition-opacity disabled:opacity-40';

interface EditorPageProps {
    item: PhotoEditorItem;
    failedLabel: string;
}

const EditorPage = ({ item, failedLabel }: EditorPageProps) => {
    const preview = item.previewSrc ? (
        <img
            src={item.previewSrc}
            alt=""
            data-placeholder=""
            draggable={false}
            className={cn(
                'pointer-events-none absolute inset-0 size-full select-none object-contain',
                item.failed && 'opacity-40'
            )}
        />
    ) : null;

    if (item.failed) {
        return (
            <>
                {preview}
                <span
                    data-failed=""
                    className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/70 px-3 py-1.5 text-[13px] font-medium text-white"
                >
                    <IconAlert className="size-4 shrink-0" aria-hidden />
                    {failedLabel}
                </span>
            </>
        );
    }
    if (item.kind === 'video') {
        return (
            <>
                {preview}
                <VideoMark
                    durationMs={item.durationMs}
                    className="bottom-auto left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-2.5 py-1 text-[13px]"
                />
            </>
        );
    }
    if (isLoaded(item)) {
        return (
            <EditedPhotoImage
                src={item.src}
                width={item.width}
                height={item.height}
                edit={item.edit ?? IDENTITY_PHOTO_EDIT}
                fit="contain"
                className="absolute inset-0"
            />
        );
    }
    return (
        <>
            {preview}
            {item.editable && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <IconSpinner className="size-8 animate-spin text-white" aria-hidden />
                </span>
            )}
        </>
    );
};

export const PhotoEditor = ({
    open,
    items,
    index,
    onIndexChange,
    onEditChange,
    onCancel,
    onDone,
    onSend,
    sendLabel,
    sending = false,
    labels,
}: PhotoEditorProps) => {
    const text: PhotoEditorLabels = {
        ...DEFAULT_LABELS,
        ...labels,
        aspects: { ...DEFAULT_LABELS.aspects, ...labels?.aspects },
    };

    const keptRef = React.useRef({ items, index });
    React.useLayoutEffect(() => {
        if (open) keptRef.current = { items, index };
    });
    const kept = open ? { items, index } : keptRef.current;
    const list = kept.items;
    const current = list.length > 0 ? Math.min(Math.max(kept.index, 0), list.length - 1) : 0;
    const showing: PhotoEditorItem | undefined = list[current];
    const many = list.length > 1;
    const hasPrevious = many && current > 0;
    const hasNext = many && current < list.length - 1;

    const [crop, setCrop] = React.useState<{ id: string; draft: PhotoEdit } | null>(null);
    const cropValid = crop !== null && open && showing?.id === crop.id && canCrop(showing);
    if (crop && !cropValid) setCrop(null);
    const cropping = cropValid && crop !== null;
    const updateDraft = (change: (draft: PhotoEdit) => PhotoEdit) =>
        setCrop(previous => (previous ? { ...previous, draft: change(previous.draft) } : previous));
    const enterCrop = () => {
        if (canCrop(showing)) setCrop({ id: showing.id, draft: showing.edit ?? IDENTITY_PHOTO_EDIT });
    };
    const leaveCrop = () => setCrop(null);
    const applyCrop = () => {
        if (!cropping || !crop) return;
        onEditChange(crop.id, crop.draft);
        setCrop(null);
    };

    const [footerRef, footer] = useBoxSize<HTMLDivElement>();
    useToastLift(open && footer.height > 0 ? footer.height : null);

    const go = (step: -1 | 1) => {
        if (!open || cropping) return;
        const target = current + step;
        if (target >= 0 && target < list.length) onIndexChange(target);
    };

    const thumbStripRef = React.useRef<HTMLDivElement | null>(null);
    React.useEffect(() => {
        const strip = thumbStripRef.current;
        if (!open || !strip) return;
        const thumb = strip.querySelector<HTMLElement>('[aria-current="true"]');
        if (!thumb || typeof strip.scrollTo !== 'function') return;
        strip.scrollTo({ left: thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2, behavior: 'smooth' });
    }, [open, current, cropping]);

    const [dragX, setDragX] = React.useState(0);
    const [dragging, setDragging] = React.useState(false);
    const pressRef = React.useRef<Press | null>(null);
    const pagerRef = React.useRef<HTMLDivElement | null>(null);

    const endDrag = () => {
        pressRef.current = null;
        setDragging(false);
        setDragX(0);
    };

    const onPointerDown = (event: React.PointerEvent) => {
        if (event.isPrimary === false) {
            if (pressRef.current) endDrag();
            return;
        }
        pressRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            at: Date.now(),
            axis: null,
        };
    };

    const onPointerMove = (event: React.PointerEvent) => {
        const press = pressRef.current;
        if (!press || press.pointerId !== event.pointerId) return;
        const dx = event.clientX - press.x;
        const dy = event.clientY - press.y;
        if (!press.axis) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < DRAG_SLOP_PX) return;
            press.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            if (press.axis === 'y' || !many) {
                pressRef.current = null;
                return;
            }
            setDragging(true);
            try {
                (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
            } catch {
                // A synthetic or already-released pointer — the moves still arrive while inside.
            }
        }
        setDragX(pagerDragOffset(dx, hasPrevious, hasNext));
    };

    const onPointerUp = (event: React.PointerEvent) => {
        const press = pressRef.current;
        if (!press || press.pointerId !== event.pointerId) return;
        if (press.axis === 'x') {
            const step = pagerReleaseStep(
                event.clientX - press.x,
                Date.now() - press.at,
                pagerRef.current?.clientWidth ?? 0
            );
            if (step !== 0) go(step);
        }
        endDrag();
    };

    const status = cropping ? null : statusOf(showing);
    const draft = cropping ? crop.draft : null;

    return (
        <Dialog.Root
            open={open}
            onOpenChange={value => {
                if (value) return;
                if (cropping) leaveCrop();
                else onCancel();
            }}
        >
            <Dialog.Portal>
                <Dialog.Overlay
                    className={cn(
                        'fixed inset-0 z-50 bg-black data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
                        VIEWER_MOTION
                    )}
                />
                <Dialog.Content
                    aria-describedby={undefined}
                    onInteractOutside={event => event.preventDefault()}
                    onEscapeKeyDown={event => {
                        event.preventDefault();
                        if (cropping) leaveCrop();
                        else onCancel();
                    }}
                    onKeyDown={event => {
                        if (!isOwnEvent(event) || cropping) return;
                        if (event.key === 'ArrowLeft') go(-1);
                        if (event.key === 'ArrowRight') go(1);
                    }}
                    className={cn(
                        'fixed inset-0 z-50 flex flex-col overflow-hidden bg-black text-white outline-none',
                        'data-[state=closed]:!pointer-events-none',
                        'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-full data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-full',
                        VIEWER_MOTION
                    )}
                >
                    <Dialog.Title className="sr-only">{text.title}</Dialog.Title>

                    <div className="shrink-0 pt-[var(--safe-top,0px)]">
                        <div className="relative flex h-14 items-center justify-between px-3">
                            {cropping ? (
                                <button type="button" onClick={leaveCrop} className={HEADER_TEXT_BUTTON}>
                                    {text.cancel}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    aria-label={text.close}
                                    onClick={onCancel}
                                    className="flex size-9 items-center justify-center rounded-full bg-white/20"
                                >
                                    <IconClose className="size-5 text-white" />
                                </button>
                            )}
                            {!cropping && many && (
                                <span
                                    aria-live="polite"
                                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[15px] font-medium"
                                >
                                    {text.counter(current + 1, list.length)}
                                </span>
                            )}
                            {cropping ? (
                                <button
                                    type="button"
                                    onClick={applyCrop}
                                    className={cn(HEADER_TEXT_BUTTON, 'text-primary')}
                                >
                                    {text.apply}
                                </button>
                            ) : (
                                <button type="button" onClick={onDone} className={HEADER_TEXT_BUTTON}>
                                    {text.done}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="relative min-h-0 flex-1 overflow-hidden">
                        {cropping && draft && canCrop(showing) ? (
                            <PhotoCropStage
                                src={showing.src}
                                width={showing.width}
                                height={showing.height}
                                edit={draft}
                                onChange={edit => updateDraft(() => edit)}
                            />
                        ) : (
                            <div
                                ref={pagerRef}
                                data-pager=""
                                onPointerDown={event => isOwnEvent(event) && onPointerDown(event)}
                                onPointerMove={event => isOwnEvent(event) && onPointerMove(event)}
                                onPointerUp={event => isOwnEvent(event) && onPointerUp(event)}
                                onPointerCancel={event => isOwnEvent(event) && endDrag()}
                                className="size-full touch-none"
                            >
                                <div
                                    data-pager-strip=""
                                    className={cn(
                                        'flex h-full w-full',
                                        !dragging &&
                                            'transition-transform duration-300 ease-out motion-reduce:transition-none'
                                    )}
                                    style={{ transform: `translate3d(calc(${-current * 100}% + ${dragX}px), 0, 0)` }}
                                >
                                    {list.map((item, i) => (
                                        <div
                                            key={item.id}
                                            data-page=""
                                            aria-hidden={i !== current || undefined}
                                            className="relative h-full w-full shrink-0"
                                        >
                                            {Math.abs(i - current) <= 1 && (
                                                <EditorPage item={item} failedLabel={text.failed} />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="shrink-0 pb-[var(--safe-bottom,0px)]">
                        <div ref={footerRef} className="flex flex-col gap-3 px-4 pb-3 pt-3">
                            {cropping && draft && canCrop(showing) ? (
                                <>
                                    <div className="flex items-center justify-between">
                                        <button
                                            type="button"
                                            aria-label={text.rotateLeft}
                                            onClick={() => updateDraft(rotatePhotoEditLeft)}
                                            className={TOOL_ICON_BUTTON}
                                        >
                                            <IconRotateLeft className="size-6" aria-hidden />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => updateDraft(() => IDENTITY_PHOTO_EDIT)}
                                            disabled={isIdentityPhotoEdit(draft) && draft.aspect === 'free'}
                                            className="h-9 rounded-full px-3 text-[15px] font-medium text-white disabled:opacity-40"
                                        >
                                            {text.reset}
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={text.flip}
                                            onClick={() => updateDraft(flipPhotoEditHorizontal)}
                                            className={TOOL_ICON_BUTTON}
                                        >
                                            <IconFlipHorizontal className="size-6" aria-hidden />
                                        </button>
                                    </div>
                                    <div className="-mx-4 flex touch-pan-x gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
                                        {CROP_ASPECTS.map(aspect => (
                                            <button
                                                key={aspect}
                                                type="button"
                                                aria-pressed={draft.aspect === aspect}
                                                onClick={() =>
                                                    updateDraft(edit =>
                                                        setPhotoEditAspect(edit, aspect, {
                                                            width: showing.width,
                                                            height: showing.height,
                                                        })
                                                    )
                                                }
                                                className={cn(
                                                    'h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium',
                                                    draft.aspect === aspect
                                                        ? 'bg-white text-black'
                                                        : 'bg-white/15 text-white'
                                                )}
                                            >
                                                {text.aspects[aspect]}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <>
                                    {many && (
                                        <div
                                            ref={thumbStripRef}
                                            className="-mx-4 flex touch-pan-x gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none]"
                                        >
                                            {list.map((item, i) => (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    aria-label={text.thumbnail(i + 1)}
                                                    aria-current={i === current ? 'true' : undefined}
                                                    onClick={() => i !== current && open && onIndexChange(i)}
                                                    className={cn(
                                                        'relative size-12 shrink-0 overflow-hidden rounded-[6px] bg-white/10',
                                                        i === current
                                                            ? 'ring-2 ring-primary ring-offset-2 ring-offset-black'
                                                            : 'opacity-70'
                                                    )}
                                                >
                                                    {isEdited(item) && isLoaded(item) ? (
                                                        <EditedPhotoImage
                                                            src={item.src}
                                                            width={item.width}
                                                            height={item.height}
                                                            edit={item.edit ?? IDENTITY_PHOTO_EDIT}
                                                            fit="cover"
                                                        />
                                                    ) : (
                                                        item.previewSrc && (
                                                            <img
                                                                src={item.previewSrc}
                                                                alt=""
                                                                draggable={false}
                                                                className="size-full object-cover"
                                                            />
                                                        )
                                                    )}
                                                    {item.kind === 'video' && (
                                                        <VideoMark className="bottom-0.5 left-0.5 py-0 pl-0.5 pr-0.5" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {status && (
                                        <p data-status={status} className="text-center text-[13px] text-white/70">
                                            {text[status]}
                                        </p>
                                    )}
                                    <div className="flex items-center justify-between gap-3">
                                        <button
                                            type="button"
                                            onClick={enterCrop}
                                            disabled={!canCrop(showing)}
                                            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-4 text-[15px] font-medium text-white disabled:opacity-40"
                                        >
                                            <IconCrop className="size-5" aria-hidden />
                                            {text.crop}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={onSend}
                                            disabled={sending}
                                            aria-busy={sending || undefined}
                                            className="flex h-10 min-w-0 items-center justify-center truncate rounded-full bg-primary px-5 text-[15px] font-semibold text-primary-foreground disabled:bg-white/20 disabled:text-white/60"
                                        >
                                            {sendLabel}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
};
