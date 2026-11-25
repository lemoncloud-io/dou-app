import { lazy, Suspense } from 'react';
import { Navigate } from 'react-router-dom';

import { runtime } from '@chatic/runtime-react';

import { ROUTES } from '../../../routes/paths';

const InAppCheckoutPage = lazy(() =>
    import('../pages/inAppCheckout/InAppCheckoutPage').then(module => ({ default: module.InAppCheckoutPage }))
);

export const InAppCheckoutRoute = () =>
    runtime.checkout.kind === 'web' ? (
        <Suspense fallback={null}>
            <InAppCheckoutPage />
        </Suspense>
    ) : (
        <Navigate to={ROUTES.subscription.plans} replace />
    );
