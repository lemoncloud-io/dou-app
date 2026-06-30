import { Outlet } from 'react-router-dom';

/** 인증된 영역의 얇은 래퍼 — chrome(사이드바/탑바)은 각 페이지가 자체 렌더(Socket Monitor 셸). */
export const PrivateLayout = () => <Outlet />;
