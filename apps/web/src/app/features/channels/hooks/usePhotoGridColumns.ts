import { config } from '@chatic/config';
import { useConfigValue } from '@chatic/config/react';
import { clampColumns } from '@chatic/web-ui-kit';

/**
 * The photo grid's column count, as the person last pinched it. `ui.photoGridColumns` is
 * `persist: 'local'`, `writableBy: ['local']` — a product setting the app writes in the course of
 * normal use, like the home sections' fold. Whatever is stored is clamped to the grid's range, so a
 * value from a build with other steps still lands on one this build draws.
 */
export const setPhotoGridColumns = (columns: number): void => {
    config.set('ui.photoGridColumns', clampColumns(columns), { lane: 'local' });
};

export const usePhotoGridColumns = () => {
    const raw = useConfigValue<number>('ui.photoGridColumns');
    return { columns: clampColumns(typeof raw === 'number' ? raw : Number.NaN), setColumns: setPhotoGridColumns };
};
