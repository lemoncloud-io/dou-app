import { useEffect, useState } from 'react';
import { Alert, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import auth from '@react-native-firebase/auth';

import { checkInviteLinkExists, createInviteLink, deleteInviteLink, getInviteLink } from '@chatic/deeplinks';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

const TEST_ID = '1000029';

export const DeeplinkTestScreen = () => {
    const [result, setResult] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [authStatus, setAuthStatus] = useState<string>('Checking auth...');

    // Anonymous auth on mount
    useEffect(() => {
        const signInAnonymously = async () => {
            try {
                const currentUser = auth().currentUser;
                if (currentUser) {
                    setAuthStatus(`Authenticated: ${currentUser.uid.slice(0, 8)}...`);
                    return;
                }

                const userCredential = await auth().signInAnonymously();
                setAuthStatus(`Signed in: ${userCredential.user.uid.slice(0, 8)}...`);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Auth failed';
                setAuthStatus(`Auth error: ${message}`);
            }
        };

        signInAnonymously();
    }, []);

    const handleCreate = async () => {
        setIsLoading(true);
        setResult('Creating...');

        try {
            const inviteData: MyInviteView = {
                id: TEST_ID,
                userId: TEST_ID,
                user$: {
                    id: TEST_ID,
                    name: 'Test User',
                },
            };

            const link = await createInviteLink(TEST_ID, inviteData, 'mobile-test');

            setResult(`Created!\n\nURL: ${link.deepLinkUrl}\nID: ${link.id}`);
            Alert.alert('Success', `Deeplink created: ${link.deepLinkUrl}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setResult(`Error: ${message}`);
            Alert.alert('Error', message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGet = async () => {
        setIsLoading(true);
        setResult('Fetching...');

        try {
            const link = await getInviteLink(TEST_ID);

            if (link) {
                setResult(`Found!\n\n${JSON.stringify(link, null, 2)}`);
            } else {
                setResult('Not found');
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setResult(`Error: ${message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCheck = async () => {
        setIsLoading(true);
        setResult('Checking...');

        try {
            const exists = await checkInviteLinkExists(TEST_ID);
            setResult(`Exists: ${exists}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setResult(`Error: ${message}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async () => {
        setIsLoading(true);
        setResult('Deleting...');

        try {
            await deleteInviteLink(TEST_ID);
            setResult('Deleted!');
            Alert.alert('Success', 'Deeplink deleted');
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            setResult(`Error: ${message}`);
            Alert.alert('Error', message);
        } finally {
            setIsLoading(false);
        }
    };

    const renderButton = (title: string, onPress: () => void, color = '#007AFF') => (
        <TouchableOpacity
            style={[styles.button, { backgroundColor: color }]}
            onPress={onPress}
            disabled={isLoading}
            activeOpacity={0.7}
        >
            <Text style={styles.buttonText}>{title}</Text>
        </TouchableOpacity>
    );

    return (
        <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
            <StatusBar barStyle="light-content" backgroundColor="#121212" />

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Test ID: {TEST_ID}</Text>
                    <Text style={styles.urlText}>URL: https://app.chatic.io/s/{TEST_ID}</Text>
                    <Text style={styles.authStatus}>{authStatus}</Text>
                </View>

                <View style={styles.buttonContainer}>
                    {renderButton('Create Invite Link', handleCreate, '#34C759')}
                    {renderButton('Get Invite Link', handleGet)}
                    {renderButton('Check Exists', handleCheck)}
                    {renderButton('Delete Invite Link', handleDelete, '#FF3B30')}
                </View>

                <View style={styles.resultSection}>
                    <Text style={styles.resultTitle}>Result:</Text>
                    <ScrollView style={styles.resultScroll} nestedScrollEnabled>
                        <Text style={styles.resultText}>{result || 'No result yet'}</Text>
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
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    urlText: {
        color: '#888',
        fontSize: 14,
        fontFamily: 'monospace',
    },
    authStatus: {
        color: '#34C759',
        fontSize: 12,
        marginTop: 8,
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
