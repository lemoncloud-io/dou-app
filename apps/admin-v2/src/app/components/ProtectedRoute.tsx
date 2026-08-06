import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { tryFetchProfile, useSessionAuth, useSessionIdentity } from '@chatic/web-core';

import { useRelaySessionGuard } from '../hooks/useRelaySessionGuard';

interface ProtectedRouteProps {
    children: React.ReactNode;
}

/** Full-screen centered card for the pre-entry gate states (권한 확인/거부). */
const GateScreen = ({ children }: { children: React.ReactNode }) => (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-8 text-center">
            {children}
        </div>
    </div>
);

/**
 * Auth + admin gate for the console. Beyond the session flag, entry requires the relay profile's
 * `$role.role === 'admin'` (GET /users/0/profile) — the backend enforces the same role on the admin
 * endpoints (e.g. `/mocks/0/list`), so gating here keeps non-admins out of a console that would
 * only show 403s. `tryFetchProfile` never alerts/redirects; a null result renders the retry state.
 */
export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
    const { isAuthenticated } = useSessionAuth();
    const { userId } = useSessionIdentity();
    const location = useLocation();
    const navigate = useNavigate();

    // Keep HTTP signing credentials fresh while the console is open (and kick truly dead
    // sessions back to the login screen instead of leaving pages to 403).
    useRelaySessionGuard(isAuthenticated);

    // Keyed by userId so a logout → login as another account never reuses the previous
    // account's cached role.
    const {
        data: profile,
        isPending,
        isFetching,
        refetch,
    } = useQuery({
        queryKey: ['admin-v2', 'profile', userId ?? 'anonymous'],
        queryFn: tryFetchProfile,
        enabled: isAuthenticated,
        staleTime: Infinity,
    });

    if (!isAuthenticated) {
        return <Navigate to="/auth/login" state={{ from: location.pathname }} replace />;
    }

    if (isPending) {
        return (
            <GateScreen>
                <p className="text-sm text-muted-foreground">권한 확인 중…</p>
            </GateScreen>
        );
    }

    if (profile?.$role?.role !== 'admin') {
        return (
            <GateScreen>
                <h1 className="text-lg font-semibold">접근 권한이 없습니다</h1>
                <p className="text-sm text-muted-foreground">
                    {profile
                        ? 'Admin V2 콘솔은 admin 역할이 부여된 계정만 사용할 수 있습니다. 관리자에게 권한을 요청해 주세요.'
                        : '권한 정보를 불러오지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.'}
                </p>
                <div className="flex justify-center gap-2">
                    {!profile && (
                        <button
                            type="button"
                            onClick={() => void refetch()}
                            disabled={isFetching}
                            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                        >
                            {isFetching ? '확인 중…' : '다시 확인'}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => navigate('/auth/logout')}
                        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                    >
                        로그아웃
                    </button>
                </div>
            </GateScreen>
        );
    }

    return <>{children}</>;
};
