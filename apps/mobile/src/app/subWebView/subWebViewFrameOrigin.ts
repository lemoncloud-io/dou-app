import { NativeModules, Platform } from 'react-native';

export const subWebViewReportsFrameOrigin = (): boolean => {
    if (Platform.OS === 'ios') return true;
    if (Platform.OS !== 'android') return false;
    return NativeModules.SubWebViewFrames?.reportsFrameOrigin === true;
};
