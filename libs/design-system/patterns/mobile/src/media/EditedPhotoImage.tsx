import * as React from 'react';

import { cn } from '@chatic/ui-kit';

import { cssMatrix, fitPhotoEditPlan } from './editedPhotoLayout';
import { planPhotoEdit, type PhotoEdit } from './photoEdit';
import { useBoxSize } from './useBoxSize';

export interface EditedPhotoImageProps {
    src: string;
    width: number;
    height: number;
    edit: PhotoEdit;
    fit?: 'contain' | 'cover';
    alt?: string;
    className?: string;
}

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
                    className="pointer-events-none absolute left-0 top-0 max-w-none select-none"
                    style={{ width, height, transformOrigin: '0 0', transform: cssMatrix(fitted.matrix) }}
                />
            </div>
        </div>
    );
};
