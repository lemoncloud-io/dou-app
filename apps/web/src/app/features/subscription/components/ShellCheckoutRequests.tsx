import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import type { ShellCheckoutScreen } from '../lib';
import { SHELL_CHECKOUT_PATH } from '../pages/ShellCheckoutPage';

export const ShellCheckoutRequests = ({ screen }: { screen: ShellCheckoutScreen }) => {
    const navigate = useNavigate();

    // ratchet-allow useEffect -- binds the checkout port, which lives outside React, to this router for as long as it is mounted
    useEffect(
        () =>
            screen.bind(({ url, replace }) =>
                navigate(`${SHELL_CHECKOUT_PATH}?${new URLSearchParams({ url })}`, { replace })
            ),
        [screen, navigate]
    );

    return null;
};
