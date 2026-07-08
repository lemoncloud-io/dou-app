import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Dimensions, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
    DEBUG_ENTRY_TITLES,
    DEBUG_SCREEN_TITLES,
    type DebugOverlayEntryKey,
    type DebugOverlayScreenKey,
} from '../debugMenu';
import {
    AppIconTestScreen,
    BootPerformanceScreen,
    BridgeTestScreen,
    DebugHomeScreen,
    DeeplinkTestScreen,
    DeviceTestScreen,
    EnvironmentSettingsScreen,
    IapTestScreen,
    MonitoringScreen,
    NotificationTestScreen,
    OAuthTestScreen,
    SmsTestScreen,
    SocketTestScreen,
    StorageTestScreen,
    UploadTestScreen,
} from '../screens';
import { useDebugTheme } from '../theme';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface DebugOverlayProps {
    initialEntry: DebugOverlayEntryKey;
    onClose: () => void;
}

const getInitialScreen = (entry: DebugOverlayEntryKey): DebugOverlayScreenKey | null => {
    if (entry === 'EnvironmentSettings') return 'EnvironmentSettings';
    if (entry === 'Monitoring') return 'Monitoring';
    if (entry === 'BootPerformance') return 'BootPerformance';
    return null;
};

export const DebugOverlay = ({ initialEntry, onClose }: DebugOverlayProps) => {
    const colors = useDebugTheme();
    const slideY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
    const [selectedScreen, setSelectedScreen] = useState<DebugOverlayScreenKey | null>(() =>
        getInitialScreen(initialEntry)
    );

    const closeWithAnimation = useCallback(() => {
        Animated.timing(slideY, {
            toValue: SCREEN_HEIGHT,
            duration: 180,
            useNativeDriver: true,
        }).start(onClose);
    }, [onClose, slideY]);

    const goBack = useCallback(() => {
        if (selectedScreen && initialEntry === 'FeatureTests') {
            setSelectedScreen(null);
            return;
        }
        closeWithAnimation();
    }, [closeWithAnimation, initialEntry, selectedScreen]);

    useEffect(() => {
        Animated.timing(slideY, {
            toValue: 0,
            duration: 220,
            useNativeDriver: true,
        }).start();
    }, [slideY]);

    useEffect(() => {
        if (Platform.OS !== 'android') return;
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            goBack();
            return true;
        });
        return () => subscription.remove();
    }, [goBack]);

    const screenTitle = selectedScreen ? DEBUG_SCREEN_TITLES[selectedScreen] : DEBUG_ENTRY_TITLES.FeatureTests;

    const content = useMemo(() => {
        switch (selectedScreen) {
            case null:
                return <DebugHomeScreen onSelect={setSelectedScreen} />;
            case 'EnvironmentSettings':
                return <EnvironmentSettingsScreen onCloseAfterWebViewReload={closeWithAnimation} />;
            case 'Monitoring':
                return <MonitoringScreen />;
            case 'BootPerformance':
                return <BootPerformanceScreen />;
            case 'SocketTest':
                return <SocketTestScreen />;
            case 'InAppPurchaseTest':
                return <IapTestScreen />;
            case 'NotificationTest':
                return <NotificationTestScreen />;
            case 'DeeplinkTest':
                return <DeeplinkTestScreen />;
            case 'DeviceTest':
                return <DeviceTestScreen />;
            case 'AppIconTest':
                return <AppIconTestScreen />;
            case 'BridgeTest':
                return <BridgeTestScreen />;
            case 'OAuthTest':
                return <OAuthTestScreen />;
            case 'StorageTest':
                return <StorageTestScreen />;
            case 'SmsTest':
                return <SmsTestScreen />;
            case 'UploadTest':
                return <UploadTestScreen />;
        }
    }, [closeWithAnimation, selectedScreen]);

    return (
        <View pointerEvents="box-none" style={styles.overlay}>
            <Animated.View style={[styles.animatedContainer, { transform: [{ translateY: slideY }] }]}>
                <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
                    <View
                        style={[
                            styles.header,
                            { backgroundColor: colors.background, borderBottomColor: colors.border },
                        ]}
                    >
                        {selectedScreen && initialEntry === 'FeatureTests' ? (
                            <TouchableOpacity style={styles.headerButton} onPress={goBack}>
                                <Text style={[styles.headerButtonText, { color: colors.text }]}>{'<'}</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.headerButton} />
                        )}
                        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                            {screenTitle}
                        </Text>
                        <TouchableOpacity style={styles.headerButton} onPress={closeWithAnimation}>
                            <Text style={[styles.headerButtonText, { color: colors.text }]}>x</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.content}>{content}</View>
                </SafeAreaView>
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 20,
        elevation: 20,
    },
    animatedContainer: {
        ...StyleSheet.absoluteFillObject,
    },
    container: {
        flex: 1,
    },
    header: {
        height: 52,
        borderBottomWidth: StyleSheet.hairlineWidth,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerButton: {
        width: 52,
        height: 52,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerButtonText: {
        fontSize: 22,
        fontWeight: '700',
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        fontSize: 17,
        fontWeight: '700',
    },
    content: {
        flex: 1,
    },
});
