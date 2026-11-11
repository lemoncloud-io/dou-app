import { useMutation } from '@tanstack/react-query';
import { relaySession, withoutToken } from '@chatic/auth';

/**
 * Creates a guest relay session from a device identifier.
 */
export const useLoginRelayGuestByDevice = () =>
    useMutation({
        // The answer is the guest account's fields: the token stays with the session.
        mutationFn: async (deviceId: string) => withoutToken(await relaySession.loginGuestByDevice(deviceId)),
    });
