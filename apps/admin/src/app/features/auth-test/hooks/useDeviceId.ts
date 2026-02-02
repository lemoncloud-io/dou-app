import { useDeviceId as useDeviceIdBase } from '@chatic/shared';

import { DEVICE_ID_STORAGE_KEY } from '../types';

/**
 * Hook to manage device ID persistence for admin auth test
 * - Wraps shared useDeviceId with admin-specific storage key
 */
export const useDeviceId = () => useDeviceIdBase(DEVICE_ID_STORAGE_KEY);
