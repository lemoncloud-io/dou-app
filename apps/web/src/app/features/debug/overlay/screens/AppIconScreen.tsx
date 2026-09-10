import { useCallback, useEffect, useState } from 'react';

import type { AppIconOption } from '@chatic/app-messages';

import { useDebugOperation } from '../../hooks';
import { appBridge } from '../../../../bridge';

/**
 * Alternate app icons — the app's App Icon Test screen, moved here (ADR-0080 결정 11).
 *
 * All three commands already existed (`FetchAppIcon`/`FetchAppIconList`/`ChangeAppIcon`); only the
 * buttons were on the wrong side.
 */
export const AppIconScreen = () => {
    const { result, run } = useDebugOperation();
    const [icons, setIcons] = useState<AppIconOption[]>([]);
    const [current, setCurrent] = useState<string | null>(null);
    const [supported, setSupported] = useState(true);

    const load = useCallback(async () => {
        try {
            const [list, active] = await Promise.all([appBridge.fetchAppIconList(), appBridge.fetchAppIcon()]);
            setIcons(list.data?.availableIcons ?? []);
            setCurrent(active.data?.iconName ?? null);
            setSupported(active.data?.supported ?? false);
        } catch {
            // The list is a convenience; `run` below reports failures the tester acted on. Leaving
            // this silent keeps a browser tab (no shell) from showing an error it cannot fix.
            setIcons([]);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    return (
        <div className="flex flex-col gap-3 p-4">
            <div>
                <h1 className="text-[20px] font-semibold leading-[1.35]">앱 아이콘</h1>
                <p className="mt-1 text-[13px] text-muted-foreground">
                    현재: {current ?? '기본'}
                    {!supported && ' · 이 플랫폼은 아이콘 변경을 지원하지 않습니다'}
                </p>
            </div>

            <div className="flex flex-wrap gap-2">
                {icons.length === 0 ? (
                    <p className="text-xs text-muted-foreground">사용할 수 있는 대체 아이콘이 없습니다</p>
                ) : (
                    icons.map(icon => (
                        <button
                            key={icon.label}
                            type="button"
                            onClick={() =>
                                void run(
                                    `아이콘 → ${icon.label}`,
                                    () => appBridge.changeAppIcon(icon.id),
                                    'ChangeAppIcon'
                                ).then(load)
                            }
                            className="rounded-md border border-border px-2 py-1 text-xs"
                        >
                            {icon.label}
                        </button>
                    ))
                )}
                <button
                    type="button"
                    onClick={() =>
                        void run('목록 새로고침', () => appBridge.fetchAppIconList(), 'FetchAppIconList').then(load)
                    }
                    className="rounded-md border border-border px-2 py-1 text-xs"
                >
                    새로고침
                </button>
            </div>

            {result && <p className="break-all font-mono text-[12px] text-muted-foreground">{result}</p>}
        </div>
    );
};
