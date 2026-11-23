import { Route, Routes, useSearchParams } from 'react-router-dom';

import { SharePage } from '../pages/SharePage';

const SharePageForId = () => {
    const [params] = useSearchParams();
    return <SharePage key={params.get('id') ?? ''} />;
};

export const ShareRoutes = () => (
    <Routes>
        <Route index element={<SharePageForId />} />
    </Routes>
);
