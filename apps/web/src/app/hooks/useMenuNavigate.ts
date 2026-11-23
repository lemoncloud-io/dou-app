import { useCallback } from 'react';

import type { NavigateWithTransitionFn } from '@lemoncloud/react-page-transition';

import { useNavigateWithTransition } from '@chatic/shared';

import { waitForMenuDismissal } from './menuDismissal';

export const useMenuNavigate = (): NavigateWithTransitionFn => {
    const navigate = useNavigateWithTransition();

    return useCallback(
        async (to, options) => {
            await waitForMenuDismissal();
            await navigate(to, options);
        },
        [navigate]
    );
};
