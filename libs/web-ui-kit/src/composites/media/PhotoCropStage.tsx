import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { dragCropRect, type CropHandle } from './cropBox';
import { cssMatrix, fitPhotoEditPlan } from './editedPhotoLayout';
import { cropAspectRatio, orientedSize, planPhotoEdit, type EditRect, type PhotoEdit } from './photoEdit';
import { useBoxSize } from './useBoxSize';

/**
 * Room kept around the photo inside the stage. A handle's touch target reaches half its size past
 * the crop box, so a box dragged to the photo's edge still has its whole handle on the stage.
 */
const STAGE_INSET_PX = 24;
/** The smallest the crop box may be dragged, on screen. Below this the handles would cover it. */
const MIN_CROP_PX = 48;

const WHOLE_FRAME: EditRect = { x: 0, y: 0, width: 1, height: 1 };

/** The visible bracket at a corner and bar at an edge, 3px thick, hugging the box from outside. */
const HANDLE_MARK = 'pointer-events-none absolute border-white';

/**
 * Each handle's touch target and the mark drawn in it. The targets are 44px across — the smallest a
 * finger reliably hits — centred on the box's edge, so half of each lies outside the box. Edge targets
 * run the length of the edge between the corners; corners are listed last so they sit on top where
 * the two meet on a small box.
 */
const HANDLES: { handle: Exclude<CropHandle, 'move'>; target: string; mark: string }[] = [
    {
        handle: 'n',
        target: 'left-[22px] right-[22px] top-0 h-11 -translate-y-1/2',
        mark: 'left-1/2 top-1/2 -mt-[3px] h-[3px] w-5 -translate-x-1/2 bg-white',
    },
    {
        handle: 's',
        target: 'bottom-0 left-[22px] right-[22px] h-11 translate-y-1/2',
        mark: 'bottom-1/2 left-1/2 -mb-[3px] h-[3px] w-5 -translate-x-1/2 bg-white',
    },
    {
        handle: 'w',
        target: 'bottom-[22px] left-0 top-[22px] w-11 -translate-x-1/2',
        mark: 'left-1/2 top-1/2 -ml-[3px] h-5 w-[3px] -translate-y-1/2 bg-white',
    },
    {
        handle: 'e',
        target: 'bottom-[22px] right-0 top-[22px] w-11 translate-x-1/2',
        mark: 'right-1/2 top-1/2 -mr-[3px] h-5 w-[3px] -translate-y-1/2 bg-white',
    },
    {
        handle: 'nw',
        target: 'left-0 top-0 size-11 -translate-x-1/2 -translate-y-1/2',
        mark: 'left-1/2 top-1/2 -ml-[3px] -mt-[3px] size-5 border-l-[3px] border-t-[3px]',
    },
    {
        handle: 'ne',
        target: 'right-0 top-0 size-11 -translate-y-1/2 translate-x-1/2',
        mark: 'right-1/2 top-1/2 -mr-[3px] -mt-[3px] size-5 border-r-[3px] border-t-[3px]',
    },
    {
        handle: 'sw',
        target: 'bottom-0 left-0 size-11 -translate-x-1/2 translate-y-1/2',
        mark: 'bottom-1/2 left-1/2 -mb-[3px] -ml-[3px] size-5 border-b-[3px] border-l-[3px]',
    },
    {
        handle: 'se',
        target: 'bottom-0 right-0 size-11 translate-x-1/2 translate-y-1/2',
        mark: 'bottom-1/2 right-1/2 -mb-[3px] -mr-[3px] size-5 border-b-[3px] border-r-[3px]',
    },
];

const percent = (value: number) => `${value * 100}%`;

interface Drag {
    pointerId: number;
    handle: CropHandle;
    x: number;
    y: number;
    /** The crop as it was when the finger went down: every move is applied to it, not to the last move. */
    start: EditRect;
}

export interface PhotoCropStageProps {
    /** A display rendition of the whole upright photo. */
    src: string;
    /** The original's upright pixel size, the space `edit` is measured in. */
    width: number;
    height: number;
    /** The draft being edited. */
    edit: PhotoEdit;
    onChange: (edit: PhotoEdit) => void;
}

/**
 * The crop & rotate tool's stage: the whole photo as it is turned and mirrored, fitted in the stage,
 * with the crop box over it. Outside the box is dimmed and the box carries rule-of-thirds lines. A
 * handle on each corner and edge resizes it, a drag inside moves it, and a box locked to an aspect
 * keeps it while resized. Kit-internal: `PhotoEditor` draws it in crop mode and owns the draft.
 *
 * The press is captured as it lands, as `GridScrubber`'s handle is, and the stage takes no browser
 * pan or pinch: on a dedicated handle there is nothing to tell apart from a tap, and a finger that
 * slides off the box has to keep dragging it.
 */
export const PhotoCropStage = ({ src, width, height, edit, onChange }: PhotoCropStageProps) => {
    const [stageRef, stage] = useBoxSize<HTMLDivElement>();
    const dragRef = React.useRef<Drag | null>(null);

    const source = { width, height };
    const displayed = orientedSize(source, edit.rotation);
    const scale = Math.max(
        0,
        Math.min(
            (stage.width - STAGE_INSET_PX * 2) / displayed.width,
            (stage.height - STAGE_INSET_PX * 2) / displayed.height
        )
    );
    const photo = {
        width: displayed.width * scale,
        height: displayed.height * scale,
        left: (stage.width - displayed.width * scale) / 2,
        top: (stage.height - displayed.height * scale) / 2,
    };
    const ready = photo.width > 0 && photo.height > 0;
    // The whole turned and mirrored photo, uncropped: the box is drawn over it instead.
    const whole = planPhotoEdit(source, { ...edit, crop: WHOLE_FRAME }, { maxArea: Infinity });
    const pixelRatio = cropAspectRatio(edit.aspect, displayed);
    // The drag arithmetic works in the frame's normalised units, where a pixel square on a wide photo
    // is a tall rectangle.
    const ratio = pixelRatio === null ? null : (pixelRatio * displayed.height) / displayed.width;
    const crop = edit.crop;

    const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        // A second finger is ignored rather than allowed to start a fight over the box. Told by
        // `isPrimary` rather than by a drag already being held, so a release the stage never saw cannot
        // leave the box stuck to a finger that is gone.
        if (event.isPrimary === false || !ready) return;
        const target = (event.target as Element).closest?.('[data-crop-handle]') as HTMLElement | null;
        const handle = target?.dataset.cropHandle as CropHandle | undefined;
        if (!handle) return;
        event.stopPropagation();
        event.preventDefault();
        try {
            event.currentTarget.setPointerCapture?.(event.pointerId);
        } catch {
            // A synthetic or already-released pointer — the moves still arrive while inside.
        }
        dragRef.current = { pointerId: event.pointerId, handle, x: event.clientX, y: event.clientY, start: crop };
    };

    const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !ready) return;
        event.stopPropagation();
        const next = dragCropRect(
            drag.start,
            drag.handle,
            { dx: (event.clientX - drag.x) / photo.width, dy: (event.clientY - drag.y) / photo.height },
            {
                ratio,
                min: { width: Math.min(1, MIN_CROP_PX / photo.width), height: Math.min(1, MIN_CROP_PX / photo.height) },
            }
        );
        onChange({ ...edit, crop: next });
    };

    const onPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        event.stopPropagation();
        dragRef.current = null;
    };

    return (
        <div
            ref={stageRef}
            data-crop-stage=""
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            className="relative size-full touch-none select-none overflow-hidden"
        >
            {ready && (
                <div
                    data-crop-photo=""
                    className="absolute"
                    style={{ left: photo.left, top: photo.top, width: photo.width, height: photo.height }}
                >
                    <img
                        src={src}
                        alt=""
                        draggable={false}
                        className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
                        style={{
                            width,
                            height,
                            transformOrigin: '0 0',
                            transform: cssMatrix(fitPhotoEditPlan(whole, photo, 'contain').matrix),
                        }}
                    />
                    <div
                        data-crop-box=""
                        data-crop-handle="move"
                        // The spread shadow dims everything around the box; the stage clips it.
                        className="absolute cursor-move touch-none shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
                        style={{
                            left: percent(crop.x),
                            top: percent(crop.y),
                            width: percent(crop.width),
                            height: percent(crop.height),
                        }}
                    >
                        <span aria-hidden className="pointer-events-none absolute inset-0 border border-white/90" />
                        <span
                            aria-hidden
                            className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/50"
                        />
                        <span
                            aria-hidden
                            className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/50"
                        />
                        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/50" />
                        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/50" />
                        {HANDLES.map(({ handle, target, mark }) => (
                            <div
                                key={handle}
                                aria-hidden
                                data-crop-handle={handle}
                                className={cn('absolute touch-none', target)}
                            >
                                <span className={cn(HANDLE_MARK, mark)} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
