import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';

interface FullScreenLoaderProps {
    visible: boolean;
    message?: string;
}

export const FullScreenLoader = ({ visible, message = '처리 중입니다...' }: FullScreenLoaderProps) => {
    return (
        <Modal
            transparent
            animationType="fade"
            visible={visible}
            onRequestClose={() => {
                void 0;
            }}
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <ActivityIndicator size="large" color="#FFFFFF" />
                    {message ? <Text style={styles.message}>{message}</Text> : null}
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    container: {
        padding: 24,
        borderRadius: 12,
        alignItems: 'center',
    },
    message: {
        marginTop: 16,
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
        textAlign: 'center',
    },
});
