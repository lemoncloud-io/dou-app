import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { runtime } from '@chatic/app-runtime';

export const LoginPage = () => {
    const navigate = useNavigate();
    const { mutate: login, isPending } = runtime.session.useLogin();

    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginId.trim() || !password.trim() || isPending) return;
        setError(null);

        login(
            { uid: loginId.trim(), pwd: password.trim(), email: true },
            {
                onSuccess: () => navigate('/chat', { replace: true }),
                onError: (err: string) => {
                    setError(err ?? 'Login failed');
                },
            }
        );
    };

    return (
        <div className="min-h-dvh flex flex-col items-center justify-center p-6 bg-background">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center space-y-1">
                    <h1 className="text-xl font-bold">Testbed Login</h1>
                    <p className="text-sm text-muted-foreground">Log in with your email</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="loginId">
                            Email
                        </label>
                        <input
                            id="loginId"
                            type="email"
                            value={loginId}
                            onChange={e => setLoginId(e.target.value)}
                            placeholder="email@example.com"
                            autoComplete="email"
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="password">
                            Password
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="Password"
                            autoComplete="current-password"
                            className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                    </div>

                    {error && (
                        <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
                    )}

                    <button
                        type="submit"
                        disabled={!loginId.trim() || !password.trim() || isPending}
                        className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 transition-opacity"
                    >
                        {isPending ? 'Logging in...' : 'Log in'}
                    </button>
                </form>

                <button
                    onClick={() => navigate(-1)}
                    className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    ← Go back
                </button>
            </div>
        </div>
    );
};
