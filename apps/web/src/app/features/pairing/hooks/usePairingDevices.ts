import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';

import { devicesKeys, pairingsKeys } from '../../../hooks/queryKeys';

/**
 * My devices on the server the session is on — the active cloud's when one is active. Read each time
 * the screen opens; a cloud that does not answer `user.list-device` yet surfaces as the query's error.
 */
export const useMyDevices = () => {
    const { user } = runtime.data.useRuntimeRepositories();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    return useQuery({
        queryKey: devicesKeys.list({ cloudId: selectedCloudId }),
        queryFn: () => user.listDevices(),
        staleTime: 0,
        retry: false,
    });
};

export const useUnlinkDevice = () => {
    const { user } = runtime.data.useRuntimeRepositories();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (deviceId: string) => user.unlinkDevice(deviceId),
        // `closed` only says the close was sent; the re-read list is what shows the result.
        onSettled: () => queryClient.invalidateQueries({ queryKey: devicesKeys.all }),
    });
};

/** The web sign-ins this account approved. Only asked for where approving is possible. */
export const useApprovedPairings = (enabled: boolean) => {
    const { pairing } = runtime.data.useRuntimeRepositories();
    return useQuery({
        queryKey: pairingsKeys.lists(),
        queryFn: () => pairing.listPairings(),
        enabled,
        staleTime: 0,
    });
};

export const useRevokePairing = () => {
    const { pairing } = runtime.data.useRuntimeRepositories();
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (pairingId: string) => pairing.revokePairing(pairingId),
        onSettled: () => queryClient.invalidateQueries({ queryKey: pairingsKeys.all }),
    });
};
