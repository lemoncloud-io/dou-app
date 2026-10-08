import * as Dialog from '@radix-ui/react-dialog';
import * as React from 'react';

import { cn } from '@chatic/lib/utils';
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
    /** The grid's square preview — drawn (object-contain) until `src` is ready. */
    previewSrc: string;
    /** Display rendition of the whole upright photo; absent while the host reads it. */
    src?: string;
    /** Upright pixel size of the ORIGINAL, the space `edit` is measured in; absent while loading. */
    width?: number;
    height?: number;
    /** Absent = unedited. */
    edit?: PhotoEdit;
    /** False for a video or a GIF: shown, tool disabled. */
    editable: boolean;
    /** The host could not read it: tool disabled, a line says so. */
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
    /** The line under the toolbar when the showing item is a video or a GIF. */
    notEditable: string;
    /** The line while the host is still reading the showing photo. */
    loading: string;
    /** The line, and the page's own notice, when the host could not read the showing photo. */
    failed: string;
    /** Where the pager is, e.g. "2 / 5". */
    counter: (position: number, total: number) => string;
    /** Accessible name of a thumbnail in the bottom strip; receives the 1-based position. */
    thumbnail: (position: number) => string;
    /** Accessible name of the editor. Not drawn. */
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
    /** Host-owned page index. */
    index: number;
    onIndexChange: (index: number) => void;
    /** Apply in crop mode reports the new edit for that item. */
    onEditChange: (id: string, edit: PhotoEdit) => void;
    /** ✕, Escape, Android back (delivered as Escape) outside crop mode. Host confirms if dirty. */
    onCancel: () => void;
    onDone: () => void;
    onSend: () => void;
    /** Already carries the count, e.g. "3장 보내기". */
    sendLabel: string;
    sending?: boolean;
    labels?: Partial<PhotoEditorLabels>;
}

interface Press {
    pointerId: number;
    x: number;
    y: number;
    at: number;
    /** Which way the drag went once it passed the slop. Only a sideways one is the pager's. */
    axis: 'x' | 'y' | null;
}

/** Whether the host has handed over what the page draws the photo from. */
const isLoaded = (item: PhotoEditorItem): item is PhotoEditorItem & { src: string; width: number; height: number } =>
    Boolean(item.src && item.width && item.height && item.width > 0 && item.height > 0);

/** Whether the crop & rotate tool can open on an item: a photo the host has read, that can be edited. */
const canCrop = (
    item: PhotoEditorItem | undefined
): item is PhotoEditorItem & { src: string; width: number; height: number } =>
    Boolean(item && item.editable && !item.failed && isLoaded(item));

/** What the line under the toolbar says about an item the tool cannot open on, if anything. */
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

/**
 * One page of the pager. A photo the host has read is drawn with its edit; until then its square
 * grid preview stands in, with a spinner while the host is still reading it. A video shows its poster
 * with the play mark — it is in the pager because it is in the pick, not because anything can be done
 * to it here.
 */
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
                {/* Centred rather than in a corner: the poster is letterboxed, and the page's corner
                    is not the poster's. */}
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
            {/* A GIF is never read for editing: its preview is all it gets, with nothing promised. */}
            {item.editable && (
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <IconSpinner className="size-8 animate-spin text-white" aria-hidden />
                </span>
            )}
        </>
    );
};

/**
 * The photos picked in the grid, full screen and editable before they are sent (product decision:
 * edit in the grid, send from the grid or from here). A black screen like `MediaViewer`'s, sliding up
 * the same way, with a pager over the picked items in pick order: ✕, a count and Done along the top,
 * and along the bottom a strip of the picked items (the showing one ringed; a tap jumps to it), the
 * crop & rotate tool and the send button.
 *
 * - ✕ — and Escape, which is also how Android's back arrives — asks to leave without keeping what was
 *   changed since the editor opened (`onCancel`). It does not close anything itself: the host decides,
 *   and asks first when something did change. Done (`onDone`) leaves keeping the edits; send
 *   (`onSend`) sends from here.
 * - A horizontal swipe turns the page, as in the viewer and with the same thresholds. There is no
 *   tap-to-close and no pull-to-close: either would throw away edits on a stray touch.
 * - Videos and GIFs are in the pager and the strip, but the tool stays greyed and a line says why.
 *   A photo still being read shows its square preview and says so; one the host could not read says
 *   that instead.
 *
 * Crop mode — the tool, on the showing photo — hides the pager, the strip and send. It draws the whole
 * photo as turned and mirrored so far with the crop box over it, the aspect presets, rotate left, flip
 * and Reset, and swaps ✕ / Done for Cancel / Apply. Everything there is a draft held here (the state of
 * one gesture, as the kit allows): Apply reports it through `onEditChange`, Cancel and Escape drop it,
 * and Reset only sets the draft back to the untouched photo — it still needs Apply. Crop mode opens only
 * on a photo the host has read (`src`, `width`, `height`) that can be edited.
 *
 * Stateless otherwise: the index, the items and their edits belong to the host. Only the showing page
 * and its neighbours are drawn, so ten renditions are not decoded at once.
 *
 * On `@radix-ui/react-dialog` directly, for the reason `MediaViewer` gives: focus, Escape and the
 * portal are what is wanted, not the styled card.
 */
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

    // What was showing, kept through the close: the editor is still on screen while it slides away,
    // and a host that clears the pick as it sends would otherwise leave it sliding away empty. A ref
    // written after each open commit rather than state: hosts build `items` afresh on every render, and
    // state would render the editor twice for each of theirs.
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

    // The crop & rotate tool's draft, for one item. It is dropped as soon as it no longer applies — the
    // editor closed, or the host moved the page or took the item away — so coming back to the photo
    // does not reopen a half-made crop.
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
    // The snackbar rests at the bottom too; while the editor shows, it rests above the toolbar instead
    // of on the send button. The height is the bar's own, above the bottom inset the snackbar already
    // clears.
    useToastLift(open && footer.height > 0 ? footer.height : null);

    const go = (step: -1 | 1) => {
        // Sliding away, or cropping: a page turn now would act on a screen the user is not looking at.
        if (!open || cropping) return;
        const target = current + step;
        if (target >= 0 && target < list.length) onIndexChange(target);
    };

    // The thumbnail of the showing item, scrolled to the middle of the strip when the page turns, so a
    // swipe through ten photos never leaves the ringed one off screen.
    const thumbStripRef = React.useRef<HTMLDivElement | null>(null);
    React.useEffect(() => {
        const strip = thumbStripRef.current;
        if (!open || !strip) return;
        const thumb = strip.querySelector<HTMLElement>('[aria-current="true"]');
        if (!thumb || typeof strip.scrollTo !== 'function') return;
        strip.scrollTo({ left: thumb.offsetLeft - (strip.clientWidth - thumb.offsetWidth) / 2, behavior: 'smooth' });
    }, [open, current, cropping]);

    // --- Pager ---

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
        // A second finger is not a swipe: let the strip settle back where it was. Told by `isPrimary`
        // rather than by a press already being held — a release that landed outside the pager before
        // the drag was captured never reached it, and that stale press must not swallow the next one.
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
            // Only a sideways drag with somewhere to go is the pager's; nothing else here drags.
            if (press.axis === 'y' || !many) {
                pressRef.current = null;
                return;
            }
            setDragging(true);
            try {
                // Keep the moves coming when the finger leaves the photo or the screen edge.
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
            // Dropping the offset and moving the index in the same render lets the strip slide on from
            // wherever the finger left it.
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
                    // The editor fills the screen, so anything "outside" it is drawn on top of it — a toast
                    // with a button of its own, or the host's discard dialog. Pressing it must not close
                    // the editor on the way.
                    onInteractOutside={event => event.preventDefault()}
                    // The host decides what leaving means, so Radix never closes on its own: in crop mode
                    // Escape only leaves crop mode, and outside it the host is asked.
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
                        // Nothing on it is pressable while it slides away. Important, because Radix's modal
                        // layer sets `pointer-events: auto` inline.
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
                                // The drag is all ours: no browser pan or pinch fights the strip.
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
