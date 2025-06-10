import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { AdminLayout } from '../../../shared';

const PostListPage = lazy(() =>
    import('../../posts/pages/post-list').then(({ PostListPage }) => ({
        default: PostListPage,
    }))
);

const PostDetailPage = lazy(() =>
    import('../../posts/pages/post-detail').then(({ PostDetailPage }) => ({
        default: PostDetailPage,
    }))
);

const PostFormPage = lazy(() =>
    import('../../posts/pages/post-form').then(({ PostFormPage }) => ({
        default: PostFormPage,
    }))
);

export const PostsRoutes = () => {
    return (
        <Routes>
            <Route element={<AdminLayout />}>
                <Route path="/create" element={<PostFormPage />} />
                <Route path="/:id" element={<PostDetailPage />} />
                <Route path="/" element={<PostListPage />} />
                <Route path="*" element={<Navigate to="/" />} />
            </Route>
        </Routes>
    );
};
