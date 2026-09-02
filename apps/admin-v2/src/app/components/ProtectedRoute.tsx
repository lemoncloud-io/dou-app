import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useRuntimeRepositories, useSessionAuth, useSessionIdentity } from '@chatic/app-runtime';

import { useRelaySessionGuard } from '../hooks/useRelaySessionGuard';

/**
 * The user repository as the runtime hands it out. Derived from the hook rather than imported from
 * `@chatic/data`, so this console depends on `@chatic/app-runtime` alone — the runtime is the single
 * window an app looks through, and a type import is enough to make the second package part of this
 * app's build surface.
 */
type UserRepository = ReturnType<typeof useRuntimeRepositories>['user'];

/**
 * Optimistic profile read for the gate: the profile if the current token still works, else null.
 *
 * The swallow lives HERE, in the caller, on purpose. `data`'s own layers reject on failure and say
 * so (`UserHttpDataSource` — "errors bubble, matching the gateway (no swallow-and-null here
 * either)"), because null-vs-throw is a screen policy: this gate renders its retry state on null
 * and must never get an alert or a redirect out of the call. It used to be `tryFetchProfile` in
 * `@chatic/app-runtime`, which made one app's gate policy part of the shared runtime surface
 * (ADR-0070 결정 5, ②안 방향).
 */
const tryFetchProfile = async (user: UserRepository) => {
    try {
        const data = await user.tryFetchProfile();
        return (data as { error?: string })?.error ? null : data;
    } catch {
        return null;
    }
};

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
    const { user } = useRuntimeRepositories();

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
        queryFn: () => tryFetchProfile(user),
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
