import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

const LIGHT_BG = '#ffffff';
const DARK_BG = '#121212';

interface ResumeOverlayProps {
    isDark: boolean;
}

/**
 * iOS 백그라운드 복귀 화면 깜빡임 방지 및 초기 로딩 시 웹뷰 영역을 가려주기 위한 오버레이 화면입니다.
 * 테마 색상(Light/Dark)에 맞게 백그라운드를 단색으로 칠하고 로고 이미지를 중앙에 배치합니다.
 */
export const ResumeOverlay = ({ isDark }: ResumeOverlayProps) => (
    <View style={[styles.resumeOverlay, { backgroundColor: isDark ? DARK_BG : LIGHT_BG }]}>
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
