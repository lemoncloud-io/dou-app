import { Route, Routes } from 'react-router-dom';

import {
    DebugBadgeCountPage,
    DebugCacheTestPage,
    DebugChatPage,
    DebugLogBufferPage,
    DebugLoginPage,
    DebugPage,
    DebugUploadPage,
} from '../pages';

export const DebugRoutes = () => {
    return (
        <Routes>
            <Route index element={<DebugPage />} />
            <Route path="login" element={<DebugLoginPage />} />
            <Route path="dashboard" element={<DebugChatPage />} />
            <Route path="log-buffer" element={<DebugLogBufferPage />} />
            <Route path="cache-test" element={<DebugCacheTestPage />} />
            <Route path="upload-test" element={<DebugUploadPage />} />
            <Route path="badge-count" element={<DebugBadgeCountPage />} />
        </Routes>
    );
};
