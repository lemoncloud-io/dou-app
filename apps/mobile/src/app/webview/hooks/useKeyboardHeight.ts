import { useEffect, useState } from 'react';
import { type EmitterSubscription, Keyboard, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * How much of the WebView's bottom edge the keyboard covers, from what the `Keyboard` event reports.
 *
 * iOS reports the keyboard frame down to the screen edge, which is where the WebView ends, so it is
 * used as is. Android does not: React Native subtracts the system bars' bottom inset from the IME
 * inset before emitting (`imeInsets.bottom - barInsets.bottom`). With edge-to-edge on, the WebView
 * reaches down behind the navigation bar, so that subtraction leaves anything padded by
 * `--keyboard-height` short by exactly the navigation bar — the chat composer sat that far behind the
 * keyboard. Adding the bottom inset back restores the distance from the WebView's bottom edge.
 *
 * Nothing reported, nothing covered: a closed keyboard reports 0, and a floating or undocked one has no
 * bottom IME inset, so Android reports minus the navigation bar for it. Either way the keyboard covers
 * nothing at the bottom, and adding the inset would turn it into the navigation bar's height.
 */
export const toWebViewKeyboardHeight = (
    platform: typeof Platform.OS,
    reported: number,
    bottomInset: number
): number => {
    if (reported <= 0) return 0;
    return platform === 'android' ? reported + bottomInset : reported;
};

/**
 * Hook to dynamically track the height of the software keyboard.
 * It listens to platform-specific keyboard events to keep the height state updated.
 *
 * @returns The height the keyboard covers of the WebView, in pixels (0 when the keyboard is closed).
 */
export const useKeyboardHeight = (): number => {
    const [reportedHeight, setReportedHeight] = useState(0);
    const { bottom: bottomInset } = useSafeAreaInsets();

    useEffect(() => {
        // iOS uses 'Will' events for smoother animations synced with the keyboard sliding up/down.
        // Android uses 'Did' events as its layout adjustments are strictly evaluated after the keyboard renders.
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
