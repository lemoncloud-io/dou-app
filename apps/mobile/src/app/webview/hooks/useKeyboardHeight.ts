import { useEffect, useState } from 'react';
import { type EmitterSubscription, Keyboard, Platform } from 'react-native';

/**
 * Hook to dynamically track the height of the software keyboard.
 * It listens to platform-specific keyboard events to keep the height state updated.
 *
 * @returns The current height of the keyboard in pixels (returns 0 when the keyboard is closed).
 */
export const useKeyboardHeight = (): number => {
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    useEffect(() => {
        // iOS uses 'Will' events for smoother animations synced with the keyboard sliding up/down.
        // Android uses 'Did' events as its layout adjustments are strictly evaluated after the keyboard renders.
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

        const showSubscription: EmitterSubscription = Keyboard.addListener(showEvent, e =>
            setKeyboardHeight(e.endCoordinates.height)
        );
        const hideSubscription: EmitterSubscription = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, []);

    return keyboardHeight;
};
