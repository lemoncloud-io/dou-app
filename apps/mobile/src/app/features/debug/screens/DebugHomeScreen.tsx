import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { HomeScreenProps } from '../navigation';
import { useDebugTheme } from '../theme';

export const DebugHomeScreen = ({ navigation }: HomeScreenProps) => {
    const colors = useDebugTheme();

    const renderMenuItem = (title: string, onPress: () => void) => (
        <TouchableOpacity
            style={[styles.menuItem, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <Text style={[styles.menuText, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.menuArrow, { color: colors.subtleText }]}>{'>'}</Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView
            style={[styles.container, { backgroundColor: colors.background }]}
            edges={['bottom', 'left', 'right']}
        >
            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.subtleText }]}>테스트 메뉴</Text>

                    {renderMenuItem('소켓 테스트', () => {
                        navigation.navigate('SocketTest');
                    })}
                    {renderMenuItem('인앱결제 테스트', () => {
                        navigation.navigate('InAppPurchaseTest');
                    })}
                    {renderMenuItem('알림 테스트', () => {
                        navigation.navigate('NotificationTest');
                    })}
                    {renderMenuItem('딥링크 테스트', () => {
                        navigation.navigate('DeeplinkTest');
                    })}
                    {renderMenuItem('디바이스 기능 테스트', () => {
                        navigation.navigate('DeviceTest');
                    })}
                    {renderMenuItem('SMS 테스트', () => {
                        navigation.navigate('SmsTest');
                    })}
                    {renderMenuItem('앱 아이콘 테스트', () => {
                        navigation.navigate('AppIconTest');
                    })}
                    {renderMenuItem('브릿지 테스트', () => {
                        navigation.navigate('BridgeTest');
                    })}
                    {renderMenuItem('대용량 업로드 테스트', () => {
                        navigation.navigate('UploadTest');
                    })}
                    {renderMenuItem('OAuth 테스트', () => {
                        navigation.navigate('OAuthTest');
                    })}
                    {renderMenuItem('스토리지 테스트', () => {
                        navigation.navigate('StorageTest');
                    })}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#121212',
    },
    content: {
        paddingBottom: 20,
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        color: '#888',
        fontSize: 14,
        marginTop: 20,
        marginBottom: 8,
        marginLeft: 16,
        textTransform: 'uppercase',
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
    },
    menuText: {
        color: '#FFFFFF',
        fontSize: 16,
    },
    menuArrow: {
        color: '#666',
        fontSize: 16,
    },
});
