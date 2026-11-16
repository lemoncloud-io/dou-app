import { useMutation } from '@tanstack/react-query';
import { sessionCommands } from '../../sessionCommands';

/**
 * Creates a guest relay session from a device identifier.
 */
export const useLoginRelayGuestByDevice = () =>
    useMutation({
        // The answer is the guest account's fields: the token stays with the session.
        mutationFn: (deviceId: string) => sessionCommands().loginGuestByDevice(deviceId),
    });
