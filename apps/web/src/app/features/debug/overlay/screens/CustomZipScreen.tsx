import { useCallback, useEffect, useState } from 'react';

import { Row } from '../../components/Row';
import { Section } from '../../components/Section';
import { useDebugOperation } from '../../hooks';
import { appBridge } from '../../../../bridge';

/**
 * Point the app's WebView at a custom web build — the app's 환경설정 screen, moved here
 * (ADR-0080 결정 11 · 미결 4).
 *
 * **PROD builds refuse, and the app decides that.** A zip URL chooses the code the WebView runs, so
 * it is the same production security surface 결정 13 removed the web-address switcher for. The guard
 * lives natively on the baked `VITE_ENV` (`useCustomZipHandler`) precisely so a compromised web
 * bundle cannot unlock it — this screen only reports what the app says.
 *
 * Turning it OFF is never refused: a device that flipped to a PROD build while a zip was active
 * still needs a way back.
 */
interface Status {
    allowed: boolean;
    localRoot: string | null;
    serverUrl: string | null;
}

export const CustomZipScreen = () => {
    const { result, run } = useDebugOperation();
    const [url, setUrl] = useState('');
    const [status, setStatus] = useState<Status | null>(null);

    const load = useCallback(async () => {
        try {
            const res = await appBridge.fetchCustomZipStatus();
            setStatus({
                allowed: res.data?.allowed ?? false,
                localRoot: res.data?.localRoot ?? null,
                serverUrl: res.data?.serverUrl ?? null,
            });
        } catch {
            // No shell, or an app build without the handler. The apply button reports that properly
            // through `run`; a status read failing just means "nothing to show".
            setStatus(null);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const active = Boolean(status?.serverUrl || status?.localRoot);

    return (
        <div className="flex flex-col gap-4 p-4">
            <div>
                <h1 className="text-[20px] font-semibold leading-[1.35]">커스텀 web zip</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    zip을 내려받아 로컬 서버로 띄우고 WebView를 그쪽으로 다시 로드합니다
                </p>
            </div>

            {status && !status.allowed && (
                <p className="text-[13px] text-destructive">
                    이 앱 빌드(PROD)에서는 적용할 수 없습니다 — 끄기만 가능합니다
                </p>
            )}

            <Section title="지금 상태">
                <Row label="서버" value={status?.serverUrl ?? '기본 웹'} />
                <Row label="풀린 위치" value={status?.localRoot ?? '—'} />
            </Section>

            <label className="flex flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-foreground">zip 주소</span>
                <input
                    type="text"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://…/web-build.zip"
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 text-[13px] outline-none focus:border-foreground"
                />
            </label>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={!url.trim() || status?.allowed === false}
                    onClick={() =>
                        void run('zip 적용', () => appBridge.applyCustomZip(url.trim()), 'ApplyCustomZip').then(load)
                    }
                    className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
                >
                    적용
                </button>
                <button
                    type="button"
                    disabled={!active}
                    onClick={() =>
                        void run('기본 웹으로', () => appBridge.disableCustomZip(), 'DisableCustomZip').then(load)
                    }
                    className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50"
                >
                    끄기
                </button>
                <button
                    type="button"
                    onClick={() => void load()}
                    className="rounded-md border border-border px-2 py-1 text-xs"
                >
                    새로고침
                </button>
            </div>

            {result && <p className="break-all font-mono text-[12px] text-muted-foreground">{result}</p>}
        </div>
    );
};
