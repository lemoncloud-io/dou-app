import { useState } from 'react';

import { useI18n } from '../i18n';
import type { ShellEnv } from '../server/envSwitch';
import { requestEnv, type SwitchOutcome } from '../shell/envClient';

type Step =
    | { kind: 'idle' }
    | { kind: 'confirm' }
    | { kind: 'starting'; env: ShellEnv }
    | { kind: 'failed'; outcome: Extract<SwitchOutcome, { ok: false }> };

/**
 * DEV | PROD in the header. Each backend runs on its own pair of ports — its own origin, so a session
 * never crosses — and switching asks `yarn local` to run the other pair, then moves there. Going to
 * prod asks first; coming back does not. Only a person switches: `window.virtualShell` has no way to.
 */
export const EnvSwitch = ({
    current,
    go = url => window.location.assign(url),
}: {
    current: ShellEnv;
    go?: (url: string) => void;
}) => {
    const { t, language } = useI18n();
    const [step, setStep] = useState<Step>({ kind: 'idle' });

    const switchTo = async (env: ShellEnv) => {
        setStep({ kind: 'starting', env });
        const outcome = await requestEnv(env);
        // The other backend is another origin, whose storage has not heard which language was picked.
        if (outcome.ok) go(`${outcome.url}?lang=${language}`);
        else setStep({ kind: 'failed', outcome });
    };

    return (
        <>
            <div className="vs-segment vs-env-switch" role="group" aria-label={t('env.switch')}>
                {(['dev', 'prod'] as const).map(env => (
                    <button
                        key={env}
                        type="button"
                        aria-pressed={current === env}
                        className={`${current === env ? 'vs-segment-on' : ''} vs-env-${env}-button`}
                        data-tip={t(`env.${env}.tip`)}
                        onClick={() => {
                            if (env === current) return;
                            if (env === 'prod') setStep({ kind: 'confirm' });
                            else void switchTo('dev');
                        }}
                    >
                        {t(`env.${env}`)}
                    </button>
                ))}
            </div>
            {step.kind !== 'idle' && (
                <div className="vs-modal-backdrop" role="presentation">
                    <div className="vs-modal" role="dialog" aria-modal="true" aria-label={t('env.switch')}>
                        {step.kind === 'confirm' && (
                            <>
                                <h3 className="vs-modal-danger">{t('env.confirm.title')}</h3>
                                <p>{t('env.confirm.body')}</p>
                                <div className="vs-actions">
                                    <button type="button" className="vs-btn" onClick={() => setStep({ kind: 'idle' })}>
                                        {t('env.cancel')}
                                    </button>
                                    <button
                                        type="button"
                                        className="vs-btn vs-btn-danger"
                                        onClick={() => void switchTo('prod')}
                                    >
                                        {t('env.confirm.go')}
                                    </button>
                                </div>
                            </>
                        )}
                        {step.kind === 'starting' && (
                            <>
                                <h3>{t('env.starting', { env: t(`env.${step.env}`) })}</h3>
                                <p>{t('env.starting.body')}</p>
                            </>
                        )}
                        {step.kind === 'failed' && (
                            <>
                                <h3>{t('env.failed')}</h3>
                                <ul className="vs-problems">
                                    {step.outcome.problems.map((problem, index) => (
                                        <li key={index}>
                                            {problem.message}
                                            {problem.fix && <span className="vs-problem-fix">{problem.fix}</span>}
                                        </li>
                                    ))}
                                </ul>
                                <div className="vs-actions">
                                    <button type="button" className="vs-btn" onClick={() => setStep({ kind: 'idle' })}>
                                        {t('env.close')}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </>
    );
};
