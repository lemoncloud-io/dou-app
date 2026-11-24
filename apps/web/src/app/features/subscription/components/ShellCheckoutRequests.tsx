import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { SHELL_CHECKOUT_PATH, type ShellCheckoutScreen } from '../lib';

export const ShellCheckoutRequests = ({ screen }: { screen: ShellCheckoutScreen }) => {
    const navigate = useNavigate();

    // ratchet-allow useEffect -- binds the checkout port, which lives outside React, to this router for as long as it is mounted
    useEffect(() => screen.bind(({ replace }) => navigate(SHELL_CHECKOUT_PATH, { replace })), [screen, navigate]);

    return null;
};
