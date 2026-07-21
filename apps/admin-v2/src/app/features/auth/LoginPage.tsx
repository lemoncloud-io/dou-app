import { useLocation } from 'react-router-dom';

export const LoginPage = () => {
    const location = useLocation();
    const from = (location.state as { from?: string } | null)?.from || '/';

    const onClickSocialLogin = (provider: string) => {
        const HOST = import.meta.env.VITE_HOST.toLowerCase();
        const SOCIAL_OAUTH = import.meta.env.VITE_SOCIAL_OAUTH_ENDPOINT.toLowerCase();
        const state = encodeURIComponent(JSON.stringify({ from }));
        const redirectUrl = `${HOST}/auth/oauth-response?state=${state}`;

        window.location.replace(`${SOCIAL_OAUTH}/oauth/${provider}/authorize?redirect=${redirectUrl}`);
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <div className="w-full max-w-md space-y-6 rounded-lg border border-border bg-card p-8">
                <div className="space-y-1 text-center">
                    <h1 className="text-2xl font-semibold">Admin V2</h1>
                    <p className="text-sm text-muted-foreground">socket-lab 콘솔에 로그인하세요</p>
                </div>
                <div className="space-y-3">
                    <button
                        type="button"
                        onClick={() => onClickSocialLogin('google')}
                        className="h-12 w-full rounded-md border border-border text-sm hover:bg-accent"
                    >
                        Google로 계속하기
                    </button>
                    <button
                        type="button"
                        onClick={() => onClickSocialLogin('kakao')}
                        className="h-12 w-full rounded-md border border-border text-sm hover:bg-accent"
                    >
                        Kakao로 계속하기
                    </button>
                </div>
            </div>
        </div>
    );
};
