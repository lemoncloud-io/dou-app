import { Route, Routes, useSearchParams } from 'react-router-dom';

import { SharePage } from '../pages/SharePage';

/**
 * One page per share: a share that arrives while another is open starts a fresh page — no picks or
 * message carried over — and the one it replaces is let go as any page that is left.
 */
const SharePageForId = () => {
    const [params] = useSearchParams();
    return <SharePage key={params.get('id') ?? ''} />;
};

export const ShareRoutes = () => (
    <Routes>
        <Route index element={<SharePageForId />} />
    </Routes>
);
