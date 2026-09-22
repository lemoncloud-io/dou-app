import { useCallback } from 'react';

import type { NavigateWithTransitionFn } from '@lemoncloud/react-page-transition';

import { useNavigateWithTransition } from '@chatic/shared';

import { waitForMenuDismissal } from './menuDismissal';

/**
 * `navigate`, for a menu item.
 *
 * Same signature and the same return as the transition-aware navigate it wraps, with one thing
 * inserted in front: a menu that is still on screen is given time to leave before the page
 * transition starts. `menuDismissal` carries why that matters and what it waits on.
 *
 * Use it from a `DropdownMenuItem` that changes screens. Anywhere else it is `navigate` plus a
 * microtask — `waitForMenuDismissal` resolves immediately when no menu is open — so it is not
 * worth reaching for, and a plain `useNavigateWithTransition` says more about the call site.
 */
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
