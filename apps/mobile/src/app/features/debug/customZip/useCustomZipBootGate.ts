import { useEffect, useRef, useState } from 'react';

import { useDebugSettingsStore } from '../../../stores/debugSettingsStore';
import { restoreCustomZip } from './customZipService';

/**
 * 앱 부팅 시 persist된 customZipLocalRoot로 로컬 서버를 복원하는 게이트.
 *
 * RACE CONTRACT: customZipServerUrl은 서버 start Promise가 resolve되기 전에는
 * 절대 set되지 않는다. isRestoringCustomZip은 복원이 settle될 때까지 true를 유지한다.
 */
export const useCustomZipBootGate = (): { isRestoringCustomZip: boolean } => {
    // 초기값을 lazy 계산해 localRoot가 있을 때 false → true 플래시를 방지
    const [isRestoringCustomZip, setIsRestoringCustomZip] = useState<boolean>(
        () => !!useDebugSettingsStore.getState().customZipLocalRoot
    );
    const hasRunRef = useRef(false);

    useEffect(() => {
        if (hasRunRef.current) return;
        hasRunRef.current = true;

        const localRoot = useDebugSettingsStore.getState().customZipLocalRoot;
        if (!localRoot) {
            setIsRestoringCustomZip(false);
            return;
        }

        // restoreCustomZip은 절대 throw하지 않음 (실패 = null)
        restoreCustomZip(localRoot)
            .then(origin => {
                const { setCustomZipLocalRoot, setCustomZipServerUrl } = useDebugSettingsStore.getState();
                if (origin) {
                    setCustomZipServerUrl(origin);
                    return;
                }
                // stale root — persist된 루트를 비워 다음 부팅부터 기본 웹으로
                setCustomZipLocalRoot(null);
            })
            .finally(() => setIsRestoringCustomZip(false));
    }, []);

    return { isRestoringCustomZip };
};
