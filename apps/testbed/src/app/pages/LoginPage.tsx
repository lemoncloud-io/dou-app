import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLogin } from '@chatic/app-runtime';

export const LoginPage = () => {
    const navigate = useNavigate();
    const { mutate: login, isPending } = useLogin();

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
                    setError(err ?? '로그인에 실패했습니다');
                },
            }
        );
    };

    return (
        <div className="min-h-dvh flex flex-col items-center justify-center p-6 bg-background">
            <div className="w-full max-w-sm space-y-6">
                <div className="text-center space-y-1">
                    <h1 className="text-xl font-bold">Testbed 로그인</h1>
                    <p className="text-sm text-muted-foreground">이메일로 로그인합니다</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="loginId">
                            이메일
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
                            비밀번호
                        </label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="비밀번호"
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
                        {isPending ? '로그인 중...' : '로그인'}
                    </button>
                </form>

                <button
                    onClick={() => navigate(-1)}
                    className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                    ← 돌아가기
                </button>
            </div>
        </div>
    );
};
