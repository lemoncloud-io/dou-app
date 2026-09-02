import { useMutation } from '@tanstack/react-query';
import { loginRelayGuestByDevice } from '../../auth/services';

/**
 * Creates a guest relay session from a device identifier.
 */
export const useLoginRelayGuestByDevice = () =>
    useMutation({
        mutationFn: (deviceId: string) => loginRelayGuestByDevice(deviceId),
    });
