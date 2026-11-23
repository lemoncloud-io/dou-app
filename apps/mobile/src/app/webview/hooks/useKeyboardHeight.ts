import { useEffect, useState } from 'react';
import { type EmitterSubscription, Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const toWebViewKeyboardHeight = (
    platform: typeof Platform.OS,
    reported: number,
    bottomInset: number
): number => {
    if (reported <= 0) return 0;
    return platform === 'android' ? reported + bottomInset : reported;
};

export const useKeyboardHeight = (): number => {
    const [reportedHeight, setReportedHeight] = useState(0);
    const { bottom: bottomInset } = useSafeAreaInsets();

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSubscription: EmitterSubscription = Keyboard.addListener(showEvent, e =>
            setReportedHeight(e.endCoordinates.height)
        );
        const hideSubscription: EmitterSubscription = Keyboard.addListener(hideEvent, () => setReportedHeight(0));

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    return toWebViewKeyboardHeight(Platform.OS, reportedHeight, bottomInset);
};
