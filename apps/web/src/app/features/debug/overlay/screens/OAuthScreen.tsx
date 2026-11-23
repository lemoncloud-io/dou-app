import { useDebugOperation } from '../../hooks';
import { useOAuthScreenStrings } from '../../i18n/screens/OAuthScreen';
import { appBridge } from '../../../../bridge';

const PROVIDERS = ['google', 'apple'] as const;

export const OAuthScreen = () => {
    const strings = useOAuthScreenStrings();
    const { result, run } = useDebugOperation();

    return (
        <div className="flex flex-col gap-3 p-4">
            <div>
                <h1 className="text-[20px] font-semibold leading-[1.35]">{strings.title}</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">{strings.subtitle}</p>
            </div>

            {PROVIDERS.map(provider => (
                <div key={provider} className="flex items-center gap-2">
                    <span className="w-16 text-xs text-muted-foreground">{provider}</span>
                    <button
                        type="button"
                        onClick={() =>
                            void run(strings.operationLabels.login(provider), () => appBridge.oAuthLogin(provider))
                        }
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        {strings.login}
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            void run(strings.operationLabels.logout(provider), () => appBridge.oAuthLogout(provider))
                        }
                        className="rounded-md border border-border px-2 py-1 text-xs"
                    >
                        {strings.logout}
                    </button>
                </div>
            ))}

            {result && <p className="break-all font-mono text-[12px] text-muted-foreground">{result}</p>}
        </div>
    );
};
