import { useMemo } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { MediaExportBridge } from '../../bridge';
import { useServices } from '../../hooks';
import { createMediaExportHandlers, type MediaExportPlatform } from './mediaExportHandlers';

// Built when the router mounts rather than at import: nothing in this module may run while the
// app's module graph is still loading.
const currentPlatform = (): MediaExportPlatform => ({
    os: Platform.OS,
    apiLevel: typeof Platform.Version === 'number' ? Platform.Version : Number(Platform.Version),
    requestStoragePermission: () => PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE),
});

export const useMediaExportHandler = () => {
    const { logService: logger } = useServices();
    return useMemo(() => createMediaExportHandlers(MediaExportBridge, currentPlatform(), logger), [logger]);
};
