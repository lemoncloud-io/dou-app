import { NativeModules } from 'react-native';

const { AppRestart } = NativeModules;

/**
 * Starts the app's JS context over (`AppRestart` on both platforms): every JS module begins again from
 * nothing, the React tree — the WebViews with it — is mounted anew, and the process with its native
 * state stays. Use it through `appRestart` (`services/appRestart`), which leaves the next context a
 * note of why it began.
 */
export const AppRestartBridge = {
    /**
     * Asks for the reload. Resolves `true` once the native side has taken it — the context ends right
     * after — and `false` when the module is missing or refused, in which case nothing happens.
     */
    reload: async (reason: string): Promise<boolean> => {
        if (!AppRestart?.reload) return false;
        try {
            return (await AppRestart.reload(reason)) === true;
        } catch (error) {
            console.warn('Failed to restart the JS context.', error);
            return false;
        }
    },
};
