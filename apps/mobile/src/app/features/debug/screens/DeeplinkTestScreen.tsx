import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Config from 'react-native-config';

import { deeplinkService } from '../../../services';
import { useDebugTheme } from '../theme';

const TEST_DEV_URL = 'chatic-dev://s';
const TEST_PROD_URL = 'chatic://s';
const TEST_RELATIVE_PATH = '/home';

export const DeeplinkTestScreen = () => {
    const [result, setResult] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const colors = useDebugTheme();

    const handleTestUrl = async (url: string) => {
        setIsLoading(true);
        setResult(`Routing URL: ${url}`);
        try {
            await deeplinkService.handleUrl(url);
            setResult(prev => `${prev}\n\nSuccessfully routed!`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setResult(prev => `${prev}\n\nError: ${message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const renderButton = (title: string, url: string, color = '#007AFF') => (
        <TouchableOpacity
            style={[styles.button, { backgroundColor: color }]}
            onPress={() => handleTestUrl(url)}
            disabled={isLoading}
            activeOpacity={0.7}
        >
            <Text style={styles.buttonText}>{title}</Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView
            style={[styles.container, { backgroundColor: colors.background }]}
            edges={['bottom', 'left', 'right']}
        >
            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.text }]}>Deep Link Service Tester</Text>
                    <Text style={[styles.infoText, { color: colors.mutedText }]}>
                        Current Env: {Config.VITE_ENV || 'PROD'}
                    </Text>
                    <Text style={[styles.infoText, { color: colors.mutedText }]}>
                        This screen simulates incoming deep links to verify routing and domain conversion.
                    </Text>
                </View>

                <View style={styles.buttonContainer}>
                    {renderButton('Test Dev Scheme Link', TEST_DEV_URL, '#34C759')}
                    {renderButton('Test Prod Scheme Link', TEST_PROD_URL, '#5856D6')}
                    {renderButton('Test Relative Path (/home)', TEST_RELATIVE_PATH, '#FF9500')}
                </View>

                <View style={styles.resultSection}>
                    <Text style={[styles.resultTitle, { color: colors.subtleText }]}>Status Log:</Text>
                    <ScrollView
                        style={[styles.resultScroll, { backgroundColor: colors.logBackground }]}
                        nestedScrollEnabled
                    >
                        <Text style={[styles.resultText, { color: colors.mutedText }]}>
                            {result || 'No actions triggered yet'}
                        </Text>
                    </ScrollView>
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
        padding: 16,
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    infoText: {
        color: '#AAAAAA',
        fontSize: 14,
        marginBottom: 6,
        lineHeight: 20,
    },
    buttonContainer: {
        gap: 12,
        marginBottom: 20,
    },
    button: {
        paddingVertical: 14,
        paddingHorizontal: 20,
        borderRadius: 8,
        alignItems: 'center',
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    resultSection: {
        flex: 1,
    },
    resultTitle: {
        color: '#888',
        fontSize: 14,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    resultScroll: {
        backgroundColor: '#1E1E1E',
        borderRadius: 8,
        padding: 12,
        maxHeight: 300,
    },
    resultText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontFamily: 'monospace',
    },
});
