import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { getThemeBackgroundColor } from '../../../hooks';

interface ResumeOverlayProps {
    isDark: boolean;
}

/**
 * An overlay screen that prevents a flash when iOS resumes from the background and covers the
 * WebView area during initial load.
 * Fills the background with a solid color matching the theme (Light/Dark) and centers the logo image.
 */
export const ResumeOverlay = ({ isDark }: ResumeOverlayProps) => (
    <View style={[styles.resumeOverlay, { backgroundColor: getThemeBackgroundColor(isDark) }]}>
        <Image source={require('../../../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
    </View>
);

const styles = StyleSheet.create({
    resumeOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logo: {
        width: 96,
        height: 96,
    },
});
