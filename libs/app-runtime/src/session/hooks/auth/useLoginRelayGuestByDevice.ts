import { useMutation } from '@tanstack/react-query';
import { relaySession } from '../../auth/relaySession';

/**
 * Creates a guest relay session from a device identifier.
 */
export const useLoginRelayGuestByDevice = () =>
    useMutation({
        mutationFn: (deviceId: string) => relaySession.loginGuestByDevice(deviceId),
    });
