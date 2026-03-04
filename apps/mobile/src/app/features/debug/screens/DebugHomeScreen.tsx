import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { HomeScreenProps } from '../navigation';

export const DebugHomeScreen = ({ navigation }: HomeScreenProps) => {
    const renderMenuItem = (title: string, onPress: () => void) => (
        <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
            <Text style={styles.menuText}>{title}</Text>
            <Text style={styles.menuArrow}>{'>'}</Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor="#121212" />

            <ScrollView contentContainerStyle={styles.content}>
                <Text style={styles.sectionTitle}>테스트 메뉴</Text>

                {renderMenuItem('소켓 테스트', () => {
                    navigation.navigate('SocketTest');
                })}
                {renderMenuItem('인앱결제 테스트', () => {
                    navigation.navigate('InAppPurchaseTest');
                })}
                {renderMenuItem('FCM 테스트', () => {
                    navigation.navigate('FcmTest');
                })}
                {renderMenuItem('딥링크 테스트', () => {
                    navigation.navigate('DeeplinkTest');
                })}
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
        backgroundColor: '#1E1E1E',
        marginBottom: 1,
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
