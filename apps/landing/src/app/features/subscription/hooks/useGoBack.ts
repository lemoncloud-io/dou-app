import { useLocation, useNavigate } from 'react-router-dom';

import { ROUTES } from '../../../routes/paths';

export const useGoBack = (): (() => void) => {
    const navigate = useNavigate();
    const { key } = useLocation();
    return () => (key === 'default' ? navigate(ROUTES.subscription.plans) : navigate(-1));
};
