import * as React from 'react';

import { cn } from '@chatic/lib/utils';

import { cssMatrix, fitPhotoEditPlan } from './editedPhotoLayout';
import { planPhotoEdit, type PhotoEdit } from './photoEdit';
import { useBoxSize } from './useBoxSize';

export interface EditedPhotoImageProps {
    /** A display rendition of the WHOLE upright photo — any size; it is stretched to `width` × `height`. */
    src: string;
    /** The original's upright pixel size: the space `edit` is measured in. */
    width: number;
    height: number;
    edit: PhotoEdit;
    /** `contain` (default) letterboxes the whole edited result in the box; `cover` fills it, for square thumbnails. */
    fit?: 'contain' | 'cover';
    /** Empty by default: the photo is decoration next to whatever names it. */
    alt?: string;
    /** On the box. The box fills its parent; the photo is drawn inside it. */
    className?: string;
}

/**
 * A photo drawn with its crop, quarter turn and mirror applied, without touching a pixel of it: the
 * edit stays an instruction until the photo is sent, and this is how the picker and the editor show
 * what the send will produce.
 *
 * The image element is laid out at the original's full size and one CSS `matrix()` maps it into a
 * frame the size of the edited result — the same matrix the export draws with (`planPhotoEdit`,
 * uncapped here, since nothing is allocated), scaled to fit. The frame clips: the matrix places the
 * whole photo, and what the crop leaves out lands around the frame, inside the box wherever the box
 * is larger than the result. The rendition may be smaller than the original; it is stretched to the
 * original's size first, so the edit, measured against the original, frames the same part of it.
 *
 * The box is measured, and re-measured as it resizes, so the fit stays right through a rotation of
 * the phone. Until it has a size the photo is not drawn.
 */
export const EditedPhotoImage = ({
    src,
    width,
    height,
    edit,
    fit = 'contain',
    alt = '',
    className,
}: EditedPhotoImageProps) => {
    const [boxRef, box] = useBoxSize<HTMLDivElement>();
    const plan = React.useMemo(
        () => planPhotoEdit({ width, height }, edit, { maxArea: Infinity }),
        [width, height, edit]
    );
    const measured = box.width > 0 && box.height > 0;
    const fitted = fitPhotoEditPlan(plan, box, fit);

    return (
        <div ref={boxRef} data-edited-photo="" className={cn('relative size-full overflow-hidden', className)}>
            <div
                data-edited-frame=""
                className="absolute overflow-hidden"
                style={{
                    left: fitted.left,
                    top: fitted.top,
                    width: fitted.width,
                    height: fitted.height,
                    visibility: measured ? undefined : 'hidden',
                }}
            >
                <img
                    src={src}
                    alt={alt}
                    draggable={false}
                    // `max-w-none`: the base styles cap an image at its container's width, which would
                    // squeeze the original-sized element before the matrix scales it.
                    className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
                    style={{ width, height, transformOrigin: '0 0', transform: cssMatrix(fitted.matrix) }}
                />
            </div>
        </div>
    );
};
