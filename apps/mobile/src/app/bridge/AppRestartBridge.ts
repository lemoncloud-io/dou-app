import { NativeModules } from 'react-native';

const { AppRestart } = NativeModules;

export const AppRestartBridge = {
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
