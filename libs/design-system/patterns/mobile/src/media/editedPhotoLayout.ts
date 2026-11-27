import type { EditSize, PhotoEditPlan } from './photoEdit';

export type PhotoFit = 'contain' | 'cover';

type Matrix = PhotoEditPlan['matrix'];

export interface FittedPhotoEdit {
    left: number;
    top: number;
    width: number;
    height: number;
    matrix: Matrix;
}

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

export const cssMatrix = (matrix: Matrix): string => `matrix(${matrix.join(', ')})`;
