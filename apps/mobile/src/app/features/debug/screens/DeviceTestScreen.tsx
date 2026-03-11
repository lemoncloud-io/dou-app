import React, { useRef, useState } from 'react';
import { FlatList, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DeviceService } from '../../../common';
import { PermissionService, type AppPermissionType } from '../../../common';

type LogType = 'info' | 'success' | 'error';

interface LogItem {
    id: string;
    type: LogType;
    message: string;
    timestamp: string;
}

export const DeviceTestScreen = () => {
    const insets = useSafeAreaInsets();
    const [logs, setLogs] = useState<LogItem[]>([]);
    const flatListRef = useRef<FlatList>(null);

    const addLog = (type: LogType, message: string) => {
        const now = new Date();
        const timeString = now.toLocaleTimeString('ko-KR', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });

        const newLog: LogItem = {
            id: Date.now().toString() + Math.random(),
            type,
            message,
            timestamp: timeString,
        };

        setLogs(prev => [...prev, newLog]);

        setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
    };

    const handleClearLogs = () => {
        setLogs([]);
    };

    const handleOpenSettings = async () => {
        addLog('info', 'Opening Settings...');
        await DeviceService.openSettings();
    };

    const handleOpenShareSheet = async () => {
        try {
            addLog('info', 'Opening Share Sheet...');
            const result = await DeviceService.openShareSheet({
                title: 'Share Test',
                message: 'This is a test message from DeviceTestScreen',
            });
            addLog('success', `Share Result: ${JSON.stringify(result)}`);
        } catch (e: any) {
            addLog('error', `Share Failed: ${e.message}`);
        }
    };

    const handleOpenDocument = async () => {
        try {
            addLog('info', 'Picking Document...');
            const results = await DeviceService.openDocument(true); // Multi-selection allowed
            if (results.length > 0) {
                addLog('success', `Picked ${results.length} files`);
                results.forEach(doc => {
                    addLog('info', `File: ${doc.name} (${doc.size} bytes)\nURI: ${doc.uri}`);
                });
            } else {
                addLog('info', 'No document picked');
            }
        } catch (e: any) {
            if (e.message?.includes('cancelled')) {
                addLog('info', 'Document picker cancelled');
            } else {
                addLog('error', `Pick Document Failed: ${e.message}`);
            }
        }
    };

    const handleGetContacts = async () => {
        try {
            addLog('info', 'Getting Contacts...');
            const contacts = await DeviceService.getContacts();
            if (contacts.length > 0) {
                addLog('success', `Got ${contacts.length} contacts`);
                addLog('info', JSON.stringify(contacts, null, 2));
            } else {
                addLog('info', 'No contacts found');
            }
        } catch (e: any) {
            addLog('error', `Get Contacts Failed: ${e.message}`);
        }
    };

    const handleOpenCamera = async () => {
        try {
            addLog('info', 'Opening Camera...');
            const assets = await DeviceService.openCamera({
                mediaType: 'photo',
                saveToPhotos: true,
            });

            if (assets && assets.length > 0) {
                addLog('success', 'Photo Captured');
                assets.forEach(asset => {
                    addLog('info', `Image: ${asset.width}x${asset.height}\nURI: ${asset.uri}`);
                });
            } else {
                addLog('info', 'Camera cancelled or no image captured');
            }
        } catch (e: any) {
            addLog('error', `Camera Failed: ${e.message}`);
        }
    };

    const handleOpenPhotoLibrary = async () => {
        try {
            addLog('info', 'Opening Photo Library...');
            const assets = await DeviceService.openPhotoLibrary({
                mediaType: 'photo',
                selectionLimit: 3,
            });

            if (assets && assets.length > 0) {
                addLog('success', `Selected ${assets.length} photos`);
                assets.forEach(asset => {
                    addLog('info', `Image: ${asset.width}x${asset.height}\nURI: ${asset.uri}`);
                });
            } else {
                addLog('info', 'Photo library cancelled or no selection');
            }
        } catch (e: any) {
            addLog('error', `Photo Library Failed: ${e.message}`);
        }
    };

    const handlePermission = async (type: 'camera' | 'photo' | 'contacts' | 'microphone') => {
        const permissionMap: Record<typeof type, AppPermissionType> = {
            camera: 'CAMERA',
            photo: 'PHOTO_LIBRARY',
            contacts: 'CONTACTS',
            microphone: 'MICROPHONE',
        };
        const appPermission = permissionMap[type];

        try {
            addLog('info', `Checking ${appPermission}...`);
            const isGranted = await PermissionService.check(appPermission);
            addLog('info', `Status: ${isGranted ? 'GRANTED' : 'NOT GRANTED'}`);

            if (!isGranted) {
                addLog('info', `Requesting ${appPermission}...`);
                const result = await PermissionService.request(appPermission);
                addLog(result ? 'success' : 'error', `Request Result: ${result ? 'GRANTED' : 'DENIED/BLOCKED'}`);
            } else {
                addLog('success', 'Permission already granted.');
            }
        } catch (e: any) {
            addLog('error', `Permission Error: ${e.message}`);
        }
    };

    const renderLogItem = ({ item }: { item: LogItem }) => {
        let color = '#888';
        if (item.type === 'success') color = '#50E3C2';
        if (item.type === 'error') color = '#FF5A5F';
        if (item.type === 'info') color = '#4A90E2';

        return (
            <View style={styles.logRow}>
                <Text style={styles.logTime}>[{item.timestamp}]</Text>
                <Text style={[styles.logText, { color }]}>{item.message}</Text>
            </View>
        );
    };

    return (
        <View style={[styles.screen, { paddingBottom: insets.bottom }]}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Device Service Test</Text>
                <TouchableOpacity onPress={handleClearLogs} style={styles.clearButton}>
                    <Text style={styles.clearButtonText}>Clear Logs</Text>
                </TouchableOpacity>
            </View>

            <FlatList
                ref={flatListRef}
                data={logs}
                keyExtractor={item => item.id}
                renderItem={renderLogItem}
                style={styles.logList}
                contentContainerStyle={styles.logContent}
                ListEmptyComponent={<Text style={styles.emptyText}>로그가 비어있습니다.</Text>}
            />

            <View style={styles.bottomContainer}>
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.scrollActionContainer}
                >
                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#607D8B' }]}
                        onPress={handleOpenSettings}
                    >
                        <Text style={styles.buttonText}>Settings</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#4A90E2' }]}
                        onPress={handleOpenShareSheet}
                    >
                        <Text style={styles.buttonText}>Share</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#F5A623' }]}
                        onPress={handleOpenDocument}
                    >
                        <Text style={styles.buttonText}>File</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#9B59B6' }]}
                        onPress={handleGetContacts}
                    >
                        <Text style={styles.buttonText}>Contacts</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#8E44AD' }]}
                        onPress={handleOpenCamera}
                    >
                        <Text style={styles.buttonText}>Camera</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#27AE60' }]}
                        onPress={handleOpenPhotoLibrary}
                    >
                        <Text style={styles.buttonText}>Gallery</Text>
                    </TouchableOpacity>

                    <View style={styles.divider} />

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#34495E' }]}
                        onPress={() => handlePermission('camera')}
                    >
                        <Text style={styles.buttonText}>Perm: Cam</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#34495E' }]}
                        onPress={() => handlePermission('photo')}
                    >
                        <Text style={styles.buttonText}>Perm: Photo</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#34495E' }]}
                        onPress={() => handlePermission('contacts')}
                    >
                        <Text style={styles.buttonText}>Perm: Contact</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.actionButton, { backgroundColor: '#34495E' }]}
                        onPress={() => handlePermission('microphone')}
                    >
                        <Text style={styles.buttonText}>Perm: Mic</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: '#121212' },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#1E1E1E',
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    headerTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: 'bold' },
    clearButton: { padding: 8 },
    clearButtonText: { color: '#888', fontSize: 12 },
    logList: { flex: 1, backgroundColor: '#000000' },
    logContent: { padding: 16 },
    logRow: { marginBottom: 8, flexDirection: 'row', flexWrap: 'wrap' },
    logTime: {
        color: '#666',
        fontSize: 12,
        marginRight: 8,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    logText: { fontSize: 14, flex: 1 },
    emptyText: { color: '#444', textAlign: 'center', marginTop: 20 },
    bottomContainer: {
        backgroundColor: '#1E1E1E',
        borderTopWidth: 1,
        borderTopColor: '#333',
        paddingVertical: 12,
    },
    scrollActionContainer: { paddingHorizontal: 12, alignItems: 'center', gap: 8 },
    actionButton: {
        height: 44,
        paddingHorizontal: 20,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        opacity: 0.9,
    },
    buttonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 14 },
    divider: {
        width: 1,
        height: 24,
        backgroundColor: '#444',
        marginHorizontal: 4,
    },
});
