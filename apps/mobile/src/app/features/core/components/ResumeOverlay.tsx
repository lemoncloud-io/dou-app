import React from 'react';
import { StyleSheet, View } from 'react-native';

import { getThemeBackgroundColor } from '../../../hooks';

interface ResumeOverlayProps {
    isDark: boolean;
}

/**
 * A solid theme-coloured cover over the WebView: on an iOS resume it hides the white flash a
 * WKWebView shows, and while a crashed WebView reloads it hides the blank page.
 *
 * Deliberately no logo. The launch splash is the only screen that shows one; a resume is not a
 * launch, and a logo here flashed on every return to the app.
 */
export const ResumeOverlay = ({ isDark }: ResumeOverlayProps) => (
    <View style={[styles.resumeOverlay, { backgroundColor: getThemeBackgroundColor(isDark) }]} />
);

const styles = StyleSheet.create({
    resumeOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
});
