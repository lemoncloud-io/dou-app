import { useMutation } from '@tanstack/react-query';
import { relaySession } from '@chatic/auth';

/**
 * Creates a guest relay session from a device identifier.
 */
export const useLoginRelayGuestByDevice = () =>
    useMutation({
        mutationFn: (deviceId: string) => relaySession.loginGuestByDevice(deviceId),
    });
