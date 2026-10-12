/**
 * How an edited photo is drawn on screen: the plan `planPhotoEdit` makes for the export, scaled to a
 * box. Kit-internal — `EditedPhotoImage` and the editor's crop stage both draw through it, so a
 * thumbnail, the editor's page and the crop stage show the same pixels the send will produce.
 */
import type { EditSize, PhotoEditPlan } from './photoEdit';

/** `contain` letterboxes the whole result in the box; `cover` fills the box and clips the overflow. */
export type PhotoFit = 'contain' | 'cover';

type Matrix = PhotoEditPlan['matrix'];

/**
 * Where an edited photo lands in a box, and how to draw it there.
 *
 * `left`, `top`, `width`, `height` are the frame the edited result fills, in the box's pixels —
 * centred, inside the box for `contain`, overflowing it evenly for `cover`. `matrix` maps a
 * SOURCE-sized image into that frame. The frame has to clip: the matrix places the whole source, and
 * everything the crop leaves out lands around the frame — inside the box, wherever the box is larger
 * than the frame.
 */
export interface FittedPhotoEdit {
    left: number;
    top: number;
    width: number;
    height: number;
    matrix: Matrix;
}

/**
 * Fits `plan`'s output into `box`: a uniform scale of the plan's own source → output matrix, so one
 * CSS `matrix()` on an element the size of the original does all of it. An empty box scales to nothing.
 */
export const fitPhotoEditPlan = (plan: PhotoEditPlan, box: EditSize, fit: PhotoFit): FittedPhotoEdit => {
    const scaleX = box.width / plan.width;
    const scaleY = box.height / plan.height;
    const scale = Math.max(0, fit === 'cover' ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY)) || 0;
    const width = plan.width * scale;
    const height = plan.height * scale;
    const [a, b, c, d, e, f] = plan.matrix;
    return {
        left: (box.width - width) / 2,
        top: (box.height - height) / 2,
        width,
        height,
        matrix: [a * scale, b * scale, c * scale, d * scale, e * scale, f * scale],
    };
};

/** A matrix as the CSS `transform` value. */
export const cssMatrix = (matrix: Matrix): string => `matrix(${matrix.join(', ')})`;
