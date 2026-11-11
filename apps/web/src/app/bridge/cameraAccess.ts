import { appBridge } from './appBridge';

/**
 * The app's answer about the camera:
 *
 * - `granted` — the camera may be opened.
 * - `refused` — the person said no, now or before; only Settings can change it.
 * - `unknown` — the app could not say (an error, a timeout, no camera to ask about). The page opens the
 *   camera as it did before it asked, if the answer still came inside the tap window, and lets the OS
 *   have its say.
 */
export type CameraAccess = 'granted' | 'refused' | 'unknown';

/**
 * Asks the app for the camera before the page opens one, raising the OS prompt when it has not been
 * answered yet.
 *
 * Android's WebView never asks for itself when a capturing file input is tapped: without the permission
 * it drops the camera and opens nothing, and the page hears nothing back. Asking first is how the page
 * learns there is a refusal to explain.
 *
 * A grant is remembered for the page. Both OSes end the app's process when a permission is taken back
 * in Settings, so a grant seen once holds for as long as this page lives, and later taps can open the
 * camera straight from the gesture instead of waiting on a round trip that may miss the tap window.
 * A refusal is not remembered: the person may allow the camera in Settings and come back.
 */
export interface CameraAccessGate {
    /** Whether a grant was already seen in this page. */
    isGranted(): boolean;
    request(): Promise<CameraAccess>;
    /** Test seam — forgets the grant. */
    reset(): void;
}

const createCameraAccess = (): CameraAccessGate => {
    let granted = false;
    return {
        isGranted: () => granted,
        async request() {
            try {
                const response = await appBridge.requestPermission('CAMERA');
                const status = response.data?.status;
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
