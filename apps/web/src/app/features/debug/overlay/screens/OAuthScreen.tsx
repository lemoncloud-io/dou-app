import { useDebugOperation } from '../../hooks';
import { appBridge } from '../../../../bridge';

/**
 * Native OAuth — the app's OAuth Test screen, moved here (ADR-0080 결정 11).
 *
 * This exercises the NATIVE sign-in sheet (`OAuthLogin`/`OAuthLogout`), which is a different path
 * from the web's own relay hand-off (`apps/desktop-web`'s `oauth.ts`): the app talks to the
 * provider SDK and returns tokens. Apple is iOS-only, so an Android run answering with a failure
 * there is the expected result, not a bug.
 */
const PROVIDERS = ['google', 'apple'] as const;

export const OAuthScreen = () => {
    const { result, run } = useDebugOperation();

    return (
        <div className="flex flex-col gap-3 p-4">
            <div>
                <h1 className="text-[20px] font-semibold leading-[1.35]">OAuth (네이티브)</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    앱의 네이티브 로그인 시트를 띄웁니다 — 웹 릴레이 경로와는 별개입니다
                </p>
            </div>

            {PROVIDERS.map(provider => (
                <div key={provider} className="flex items-center gap-2">
                    <span className="w-16 text-xs text-muted-foreground">{provider}</span>
                    <button
                        type="button"
                        onClick={() => void run(`${provider} 로그인`, () => appBridge.oAuthLogin(provider))}
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        로그인
                    </button>
                    <button
                        type="button"
                        onClick={() => void run(`${provider} 로그아웃`, () => appBridge.oAuthLogout(provider))}
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        로그아웃
                    </button>
                </div>
            ))}

            {result && <p className="break-all font-mono text-[12px] text-muted-foreground">{result}</p>}
        </div>
    );
};
