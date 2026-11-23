import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime';

import { useRelaySessionGuard } from '../hooks/useRelaySessionGuard';
import { useSocketWakeRecovery } from '../hooks/useSocketWakeRecovery';

type UserRepository = ReturnType<typeof runtime.data.useRuntimeRepositories>['user'];

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

const GateScreen = ({ children }: { children: React.ReactNode }) => (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-card p-8 text-center">
            {children}
        </div>
    </div>
);

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
    const { isAuthenticated } = runtime.session.useSessionAuth();
    const { userId } = runtime.session.useSessionIdentity();
    const location = useLocation();
    const navigate = useNavigate();
    const { user } = runtime.data.useRuntimeRepositories();

    useRelaySessionGuard(isAuthenticated);

    useSocketWakeRecovery(isAuthenticated);

    const {
        data: profile,
        isPending,
        isFetching,
        refetch,
    } = useQuery({
        queryKey: ['admin', 'profile', userId ?? 'anonymous'],
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
                <p className="text-sm text-muted-foreground">Checking permissions…</p>
            </GateScreen>
        );
    }

    if (profile?.$role?.role !== 'admin') {
        return (
            <GateScreen>
                <h1 className="text-lg font-semibold">You don't have access</h1>
                <p className="text-sm text-muted-foreground">
                    {profile
                        ? 'The Admin console is only usable by accounts granted the admin role. Ask an administrator for access.'
                        : 'Failed to load your permissions. Check your network connection and try again.'}
                </p>
                <div className="flex justify-center gap-2">
                    {!profile && (
                        <button
                            type="button"
                            onClick={() => void refetch()}
                            disabled={isFetching}
                            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                        >
                            {isFetching ? 'Checking…' : 'Check again'}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => navigate('/auth/logout')}
                        className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                    >
                        Log out
                    </button>
                </div>
            </GateScreen>
        );
    }

    return <>{children}</>;
};
