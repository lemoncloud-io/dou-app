import { useState } from 'react';

import { useDebugOperation } from '../../hooks';
import { appBridge } from '../../../../bridge';

/**
 * SMS compose — the app's SMS Test screen, moved here (ADR-0080 결정 11).
 *
 * `SendSms` hands the OS a prefilled compose sheet; the person still presses send, so nothing is
 * sent without a human. `GetContacts` is here for the same reason the app's screen had it: picking
 * a real number beats typing one.
 */
export const SmsScreen = () => {
    const { result, run } = useDebugOperation();
    const [numbers, setNumbers] = useState('');
    const [message, setMessage] = useState('디버그 패널에서 보낸 문자입니다');

    const recipients = numbers
        .split(',')
        .map(n => n.trim())
        .filter(Boolean);

    return (
        <div className="flex flex-col gap-4 p-4">
            <div>
                <h1 className="text-[20px] font-semibold leading-[1.35]">SMS</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    OS 작성 창을 띄웁니다 — 보내기는 사람이 눌러야 합니다
                </p>
            </div>

            <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-foreground">받는 번호 (쉼표로 구분)</span>
                <input
                    type="text"
                    value={numbers}
                    onChange={e => setNumbers(e.target.value)}
                    placeholder="01012345678, 01087654321"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[13px] outline-none focus:border-foreground"
                />
            </label>

            <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-foreground">본문</span>
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
                    onClick={() => void run('SMS', () => appBridge.sendSms(recipients, message))}
                    className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
                >
                    작성 창 열기
                </button>
                <button
                    type="button"
                    onClick={() => void run('연락처', () => appBridge.getContacts())}
                    className="rounded-md border border-border px-2 py-1 text-xs"
                >
                    연락처 불러오기
                </button>
            </div>

            {result && <p className="break-all font-mono text-[12px] text-muted-foreground">{result}</p>}
        </div>
    );
};
