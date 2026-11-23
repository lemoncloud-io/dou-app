import { runtime } from '@chatic/runtime';

export type CameraAccess = 'granted' | 'refused' | 'unknown';

export interface CameraAccessGate {
    isGranted(): boolean;
    request(): Promise<CameraAccess>;
    reset(): void;
}

const createCameraAccess = (): CameraAccessGate => {
    let granted = false;
    return {
        isGranted: () => granted,
        async request() {
            const permission = runtime.media.cameraPermission;
            if (!permission) return 'unknown';
            try {
                const status = await permission.request();
                if (status === 'GRANTED') {
                    granted = true;
                    return 'granted';
                }
                if (status === 'DENIED' || status === 'BLOCKED') return 'refused';
                return 'unknown';
            } catch {
                return 'unknown';
            }
        },
        reset() {
            granted = false;
        },
    };
};

export const cameraAccess = createCameraAccess();
