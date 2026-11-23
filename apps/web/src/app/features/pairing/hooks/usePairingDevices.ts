import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime';

import { devicesKeys, pairingsKeys } from '../../../hooks/queryKeys';

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
        onSettled: () => queryClient.invalidateQueries({ queryKey: devicesKeys.all }),
    });
};

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
