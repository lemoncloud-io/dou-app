import { type JSX, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ROUTES } from '../../../../routes/paths';
import { type ConsentChoice, consentDefaultOf, useMockController, useMockState } from '../../lib/mock';

const CHOICES: Array<{ value: ConsentChoice; label: string }> = [
    { value: 'continue', label: 'Continue with this account' },
    { value: 'noAccount', label: 'No DoU account linked' },
    { value: 'canceled', label: 'Cancel' },
    { value: 'expired', label: 'Time out' },
];

/**
 * The mock's stand-in for Google's or Apple's consent page. `startSignIn` sends the browser here,
 * and this sends it back to the callback the way a provider would — so the sign-in pages walk the
 * same redirect round trip they will with a real provider. Registered only with the mock port, and so
 * only where the subscription pages are open. A developer's page: English, not in the copy files.
 */
export const MockProviderPage = (): JSX.Element | null => {
    const controller = useMockController();
    if (!controller) return null;
    return <ConsentForm controller={controller} />;
};

const ConsentForm = ({
    controller,
}: {
    controller: NonNullable<ReturnType<typeof useMockController>>;
}): JSX.Element => {
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const state = useMockState(controller);
    const [choice, setChoice] = useState<ConsentChoice>(() => consentDefaultOf(state));
    const provider = params.get('provider') ?? state.signIn.provider;
    const who = provider === 'apple' ? 'Apple ID' : (state.signIn.hint ?? state.account.email ?? state.account.id);

    const submit = () => {
        const back = new URLSearchParams({ provider, nonce: params.get('nonce') ?? '', result: choice });
        navigate(`${ROUTES.subscription.loginCallback}?${back}`, { replace: true });
    };

    return (
        <main className="flex min-h-full items-center justify-center bg-muted p-6">
            <div className="w-full max-w-[380px] rounded-2xl bg-card p-6 shadow-lg">
                <p className="text-xs uppercase tracking-wide text-subtitle">Mock {provider} sign-in</p>
                <h1 className="mt-1 text-lg font-semibold text-navy">{who}</h1>
                <fieldset className="mt-4 flex flex-col gap-2 text-sm">
                    {CHOICES.map(option => (
                        <label key={option.value} className="flex items-center gap-2">
                            <input
                                type="radio"
                                name="choice"
                                value={option.value}
                                checked={choice === option.value}
                                onChange={() => setChoice(option.value)}
                            />
                            {option.label}
                        </label>
                    ))}
                </fieldset>
                <button
                    type="button"
                    onClick={submit}
                    className="mt-6 h-11 w-full rounded-xl bg-navy font-semibold text-white hover:opacity-90"
                >
                    Return to DoU
                </button>
            </div>
        </main>
    );
};
