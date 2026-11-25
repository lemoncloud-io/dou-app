import { runtime } from '@chatic/runtime-react';
import { clampColumns } from '@chatic/web-ui-kit';

export const setPhotoGridColumns = (columns: number): void => {
    runtime.settings.set('ui.photoGridColumns', clampColumns(columns), { lane: 'local' });
};

export const usePhotoGridColumns = () => {
    const raw = runtime.settings.useConfigValue<number>('ui.photoGridColumns');
    return { columns: clampColumns(typeof raw === 'number' ? raw : Number.NaN), setColumns: setPhotoGridColumns };
};
