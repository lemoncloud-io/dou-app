import { useCallback, useState } from 'react';

import { useDebugRuntimeStore } from '../../../stores/debugRuntimeStore';
import { useDebugSettingsStore } from '../../../stores/debugSettingsStore';
import {
    cleanupCustomZipDir,
    downloadZip,
    extractZip,
    startCustomZipServer,
    stopCustomZipServer,
} from './customZipService';

export type CustomZipStatus = 'idle' | 'downloading' | 'extracting' | 'serving' | 'error';

export const useCustomZipLoader = () => {
    const [status, setStatus] = useState<CustomZipStatus>('idle');
    const [error, setError] = useState<string | null>(null);

    const applyZip = useCallback(async (zipUrl: string): Promise<boolean> => {
        setError(null);
        const settings = useDebugSettingsStore.getState();
        const wasActive = Boolean(settings.customZipLocalRoot || settings.customZipServerUrl);
        try {
            setStatus('downloading');
            // 교체 시나리오: 서빙 중인 webroot를 지우기 전에 서버를 내리고 활성 상태를 해제.
            // 안 그러면 새 zip 실패 시 store가 이미 삭제된 루트를 가리키는 반쪽 상태가 남는다.
            if (wasActive) {
                await stopCustomZipServer();
                settings.setCustomZipServerUrl(null);
                settings.setCustomZipLocalRoot(null);
            }
            await cleanupCustomZipDir();
            const zipPath = await downloadZip(zipUrl);

            setStatus('extracting');
            const extractRoot = await extractZip(zipPath, zipUrl);
            const origin = await startCustomZipServer(extractRoot);

            // 서버 start 성공 이후에만 store를 갱신 — 실패 시 기본 웹 폴백 유지
            const { setCustomZipLocalRoot, setCustomZipServerUrl } = useDebugSettingsStore.getState();
            setCustomZipLocalRoot(extractRoot);
            setCustomZipServerUrl(origin);
            useDebugRuntimeStore.getState().requestWebViewReload();
            setStatus('serving');
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setStatus('error');
            // 교체 실패: 이전 커스텀은 이미 내려간 상태 — 죽은 origin에 머물지 않도록 기본 웹으로 재로딩
            if (wasActive) {
                useDebugRuntimeStore.getState().requestWebViewReload();
            }
            return false;
        }
    }, []);

    const disableZip = useCallback(async (): Promise<void> => {
        await stopCustomZipServer();
        const { setCustomZipLocalRoot, setCustomZipServerUrl } = useDebugSettingsStore.getState();
        setCustomZipServerUrl(null);
        setCustomZipLocalRoot(null);
        await cleanupCustomZipDir();
        useDebugRuntimeStore.getState().requestWebViewReload();
        setError(null);
        setStatus('idle');
    }, []);

    return { status, error, applyZip, disableZip };
};
