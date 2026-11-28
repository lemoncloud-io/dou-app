import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { siteSwitchMutation } from '@chatic/runtime/api/session';

export const useSiteSwitch = () => {
    const mutation = useMutation({
        mutationKey: siteSwitchMutation.mutationKey,
        mutationFn: siteSwitchMutation.mutationFn,
    });

    const { mutateAsync } = mutation;

    return {
        switchSite: useCallback((siteId: string) => mutateAsync(siteId), [mutateAsync]),
        isSwitching: mutation.isPending,
    };
};
