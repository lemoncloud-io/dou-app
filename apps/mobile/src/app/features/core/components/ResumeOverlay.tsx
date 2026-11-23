import React from 'react';
import { StyleSheet, View } from 'react-native';

import { getThemeBackgroundColor } from '../../../hooks';

interface ResumeOverlayProps {
    isDark: boolean;
}

export const ResumeOverlay = ({ isDark }: ResumeOverlayProps) => (
    <View style={[styles.resumeOverlay, { backgroundColor: getThemeBackgroundColor(isDark) }]} />
);

const styles = StyleSheet.create({
    resumeOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
});
