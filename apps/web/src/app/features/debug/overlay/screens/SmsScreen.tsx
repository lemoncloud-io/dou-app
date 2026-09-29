import { useState } from 'react';

import { useDebugOperation } from '../../hooks';
import { useSmsScreenStrings } from '../../i18n/screens/SmsScreen';
import { appBridge } from '../../../../bridge';

/**
 * SMS compose — the app's SMS Test screen, moved here (ADR-0080 decision 11).
 *
 * `SendSms` hands the OS a prefilled compose sheet; the person still presses send, so nothing is
 * sent without a human. `GetContacts` is here for the same reason the app's screen had it: picking
 * a real number beats typing one.
 */
export const SmsScreen = () => {
    const strings = useSmsScreenStrings();
    const { result, run } = useDebugOperation();
    const [numbers, setNumbers] = useState('');
    const [message, setMessage] = useState(strings.defaultMessage);

    const recipients = numbers
        .split(',')
        .map(n => n.trim())
        .filter(Boolean);

    return (
        <div className="flex flex-col gap-4 p-4">
            <div>
                <h1 className="text-[20px] font-semibold leading-[1.35]">{strings.title}</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">{strings.subtitle}</p>
            </div>

            <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-foreground">{strings.recipientsLabel}</span>
                <input
                    type="text"
                    value={numbers}
                    onChange={e => setNumbers(e.target.value)}
                    placeholder={strings.recipientsPlaceholder}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[13px] outline-none focus:border-foreground"
                />
            </label>

            <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-foreground">{strings.messageLabel}</span>
                <textarea
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-[13px] outline-none focus:border-foreground"
                />
            </label>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={recipients.length === 0}
                    onClick={() =>
                        void run(strings.operationLabels.sms, () => appBridge.sendSms(recipients, message), 'SendSms')
                    }
                    className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
                >
                    {strings.openComposeSheet}
                </button>
                <button
                    type="button"
                    onClick={() =>
                        void run(strings.operationLabels.contacts, () => appBridge.getContacts(), 'GetContacts')
                    }
                    className="rounded-md border border-border px-2 py-1 text-xs"
                >
                    {strings.loadContacts}
                </button>
            </div>

            {result && <p className="break-all font-mono text-[12px] text-muted-foreground">{result}</p>}
        </div>
    );
};
