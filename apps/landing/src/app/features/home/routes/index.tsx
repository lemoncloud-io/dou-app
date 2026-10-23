import { type JSX } from 'react';

import { HomePage } from '../pages';

// One screen at the root URL. Any other path is the route table's catch-all, not home's: it
// redirects to `/` and lands here.
export const HomeRoutes = (): JSX.Element => {
    return <HomePage />;
};
