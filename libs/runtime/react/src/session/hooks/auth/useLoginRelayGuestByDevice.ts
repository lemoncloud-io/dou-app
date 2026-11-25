import { useMutation } from '@tanstack/react-query';
import { sessionCommands } from '@chatic/runtime-client';

export const useLoginRelayGuestByDevice = () =>
    useMutation({
        mutationFn: (deviceId: string) => sessionCommands().loginGuestByDevice(deviceId),
    });
