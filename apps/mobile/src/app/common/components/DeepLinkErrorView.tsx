import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { t } from '../i18n';

interface DeepLinkErrorViewProps {
    onGoHome: () => void;
    reason?: string | null;
}

export const DeepLinkErrorView = ({ onGoHome, reason }: DeepLinkErrorViewProps) => {
    return (
        <View style={styles.container}>
            <Image source={require('../../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.title}>{t('deepLink.errorTitle')}</Text>
            <Text style={styles.message}>{t('deepLink.errorMessage')}</Text>
            {reason && <Text style={styles.reason}>{reason}</Text>}
            <TouchableOpacity style={styles.button} onPress={onGoHome}>
                <Text style={styles.buttonText}>{t('deepLink.goHome')}</Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#ffffff',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    logo: {
        width: 80,
        height: 80,
        marginBottom: 24,
    },
    title: {
        fontSize: 20,
        fontWeight: '700',
        color: '#222325',
        marginBottom: 8,
        textAlign: 'center',
    },
    message: {
        fontSize: 15,
        fontWeight: '400',
        color: '#9FA2A7',
        textAlign: 'center',
        lineHeight: 22,
    },
    button: {
        marginTop: 32,
        backgroundColor: '#222325',
        borderRadius: 100,
        paddingVertical: 14,
        paddingHorizontal: 48,
    },
    buttonText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#ffffff',
    },
    reason: {
        fontSize: 12,
        fontWeight: '400',
        color: '#BABCC0',
        textAlign: 'center',
        marginTop: 8,
    },
});
