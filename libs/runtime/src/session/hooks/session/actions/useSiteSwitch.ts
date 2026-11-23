import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';

import { SWITCH_SITE_MUTATION_KEY } from '../../mutationKeys';

import { sessionCommands } from '@chatic/runtime-client';

export const useSiteSwitch = () => {
    const mutation = useMutation({
        mutationKey: SWITCH_SITE_MUTATION_KEY,
        mutationFn: (siteId: string) => sessionCommands().switchSite(siteId),
    });

    const { mutateAsync } = mutation;

    return {
        switchSite: useCallback((siteId: string) => mutateAsync(siteId), [mutateAsync]),
        isSwitching: mutation.isPending,
    };
};
