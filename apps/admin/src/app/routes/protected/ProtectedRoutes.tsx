import { Navigate } from 'react-router-dom';

import { BoardTypesRoutes } from '../../features/board-types';
import { BoardsRoutes } from '../../features/boards';
import { HomeRoutes } from '../../features/home';
import { PostsRoutes } from '../../features/posts';

export const ProtectedRoutes = [
    { path: `/board-types/*`, element: <BoardTypesRoutes /> },
    { path: `/boards/*`, element: <BoardsRoutes /> },
    { path: `/boards/:boardId/posts/*`, element: <PostsRoutes /> },
    { path: `/*`, element: <HomeRoutes /> },
    { path: '/', element: <Navigate to="/home" replace /> },
    { path: '*', element: <Navigate to="/home" replace /> },
];
