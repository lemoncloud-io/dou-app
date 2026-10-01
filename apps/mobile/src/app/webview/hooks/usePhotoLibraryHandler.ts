import { useMemo } from 'react';
import { PhotoLibraryBridge } from '../../bridge';
import { useServices } from '../../hooks/useServices';
import { createPhotoLibraryHandlers } from './photoLibraryHandlers';

export const usePhotoLibraryHandler = () => {
    const { logService: logger } = useServices();
    return useMemo(
        () => ({
            isAvailable: PhotoLibraryBridge.isAvailable,
            ...createPhotoLibraryHandlers(PhotoLibraryBridge, logger),
        }),
        [logger]
    );
};
