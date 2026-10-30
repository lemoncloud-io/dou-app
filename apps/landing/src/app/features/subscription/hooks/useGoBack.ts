import { useLocation, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../routes/paths';

/**
 * The back button's action. A page opened straight from a link has nothing behind it to go back to
 * (the router gives its first entry the key `default`); the plans are the way out then.
 */
export const useGoBack = (): (() => void) => {
    const navigate = useNavigate();
    const { key } = useLocation();
    return () => (key === 'default' ? navigate(ROUTES.subscription.plans) : navigate(-1));
};
