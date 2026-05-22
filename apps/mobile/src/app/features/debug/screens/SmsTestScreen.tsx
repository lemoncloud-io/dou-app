import React, { useCallback, useRef, useState } from 'react';
import {
    FlatList,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useServices } from '../../../hooks';

type LogType = 'info' | 'success' | 'error';

interface LogItem {
    id: string;
    type: LogType;
    message: string;
    timestamp: string;
}

export const SmsTestScreen = () => {
    const insets = useSafeAreaInsets();
    const { smsService, deviceService, logService: logger } = useServices();

    const [recipients, setRecipients] = useState<string>('');
    const [message, setMessage] = useState<string>('Hello! This is a test message.');
    const [logs, setLogs] = useState<LogItem[]>([]);
    const [contacts, setContacts] = useState<any[]>([]);
    const [isContactModalVisible, setIsContactModalVisible] = useState(false);

    const flatListRef = useRef<FlatList>(null);

    const addLog = useCallback((type: LogType, msg: string) => {
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
            message: msg,
            timestamp: timeString,
        };

        setLogs(prev => [...prev, newLog]);

        setTimeout(() => {
            flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
    }, []);

    const handleClearLogs = useCallback(() => {
        setLogs([]);
    }, []);

    const handleSendSms = useCallback(async () => {
        if (!recipients.trim()) {
            addLog('error', 'Please enter at least one phone number.');
            return;
        }

        const phoneNumbers = recipients
            .split(',')
            .map(n => n.trim())
            .filter(Boolean);

        if (phoneNumbers.length === 0) {
            addLog('error', 'No valid phone numbers found.');
            return;
        }

        try {
            addLog('info', `Sending SMS to ${phoneNumbers.length} recipient(s)...`);
            const success = await smsService.sendSms(
                phoneNumbers.length === 1 ? phoneNumbers[0] : phoneNumbers,
                message
            );
            if (success) {
                addLog('success', 'Native SMS client opened successfully.');
            } else {
                addLog('error', 'Failed to open native SMS client.');
            }
        } catch (e: any) {
            addLog('error', `Send SMS Error: ${e.message}`);
        }
    }, [recipients, message, smsService, addLog]);

    const handleFetchContacts = useCallback(async () => {
        try {
            addLog('info', 'Fetching device contacts...');
            const list = await deviceService.getContacts();
            if (list.length > 0) {
                setContacts(list);
                setIsContactModalVisible(true);
                addLog('success', `Fetched ${list.length} contact(s).`);
            } else {
                addLog('error', 'No contacts found or permission denied.');
            }
        } catch (e: any) {
            addLog('error', `Fetch Contacts Error: ${e.message}`);
        }
    }, [deviceService, addLog]);

    const handleSelectContact = useCallback(
        (phone: string) => {
            setRecipients(prev => {
                const cleanPhone = phone.replace(/[^0-9+]/g, '');
                if (!prev.trim()) {
                    return cleanPhone;
                }
                return `${prev}, ${cleanPhone}`;
            });
            setIsContactModalVisible(false);
            addLog('info', `Selected phone: ${phone}`);
        },
        [addLog]
    );

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
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>SMS Service Test</Text>
                <TouchableOpacity onPress={handleClearLogs} style={styles.clearButton}>
                    <Text style={styles.clearButtonText}>Clear Logs</Text>
                </TouchableOpacity>
            </View>

            {/* Inputs Panel */}
            <ScrollView style={styles.form} keyboardShouldPersistTaps="handled">
                <View style={styles.inputGroup}>
                    <View style={styles.inputHeader}>
                        <Text style={styles.label}>Recipients (Comma-separated)</Text>
                        <TouchableOpacity style={styles.contactPickButton} onPress={handleFetchContacts}>
                            <Text style={styles.contactPickText}>+ Contacts</Text>
                        </TouchableOpacity>
                    </View>
                    <TextInput
                        style={styles.textInput}
                        placeholder="e.g. 01012345678, 01087654321"
                        placeholderTextColor="#555"
                        value={recipients}
                        onChangeText={setRecipients}
                        keyboardType="phone-pad"
                    />
                </View>

                <View style={styles.inputGroup}>
                    <Text style={styles.label}>Message Body</Text>
                    <TextInput
                        style={[styles.textInput, styles.multilineInput]}
                        placeholder="Enter message text here"
                        placeholderTextColor="#555"
                        value={message}
                        onChangeText={setMessage}
                        multiline
                        numberOfLines={3}
                    />
                </View>

                <TouchableOpacity style={styles.sendButton} onPress={handleSendSms}>
                    <Text style={styles.sendButtonText}>Send SMS</Text>
                </TouchableOpacity>
            </ScrollView>

            {/* Logs Area */}
            <View style={styles.logContainer}>
                <Text style={styles.logHeader}>Console Logs</Text>
                <FlatList
                    ref={flatListRef}
                    data={logs}
                    keyExtractor={item => item.id}
                    renderItem={renderLogItem}
                    style={styles.logList}
                    contentContainerStyle={styles.logContent}
                    ListEmptyComponent={<Text style={styles.emptyText}>로그가 비어있습니다.</Text>}
                />
            </View>

            {/* Contact Picker Modal */}
            <Modal
                visible={isContactModalVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setIsContactModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View
                        style={[styles.modalContent, { marginTop: insets.top + 20, marginBottom: insets.bottom + 20 }]}
                    >
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select Contact Phone Number</Text>
                            <TouchableOpacity
                                onPress={() => setIsContactModalVisible(false)}
                                style={styles.modalCloseButton}
                            >
                                <Text style={styles.modalCloseText}>Close</Text>
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={contacts}
                            keyExtractor={item => item.recordID}
                            contentContainerStyle={styles.contactListContent}
                            renderItem={({ item }) => {
                                const phone = item.phoneNumbers?.[0]?.number;
                                if (!phone) return null;
                                return (
                                    <TouchableOpacity
                                        style={styles.contactRow}
                                        onPress={() => handleSelectContact(phone)}
                                    >
                                        <Text style={styles.contactName}>
                                            {item.displayName || `${item.givenName} ${item.familyName}`}
                                        </Text>
                                        <Text style={styles.contactPhone}>{phone}</Text>
                                    </TouchableOpacity>
                                );
                            }}
                            ListEmptyComponent={
                                <Text style={styles.emptyText}>No contacts available with phone numbers.</Text>
                            }
                        />
                    </View>
                </View>
            </Modal>
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
    form: { padding: 16, flex: 0.5 },
    inputGroup: { marginBottom: 16 },
    inputHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    label: { color: '#AAA', fontSize: 13, fontWeight: 'bold', marginBottom: 8 },
    contactPickButton: {
        backgroundColor: '#34495E',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 4,
    },
    contactPickText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
    textInput: {
        backgroundColor: '#1E1E1E',
        color: '#FFF',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 6,
        fontSize: 14,
        borderWidth: 1,
        borderColor: '#333',
    },
    multilineInput: {
        height: 80,
        textAlignVertical: 'top',
    },
    sendButton: {
        backgroundColor: '#4A90E2',
        height: 48,
        borderRadius: 8,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    sendButtonText: { color: '#FFF', fontWeight: 'bold', fontSize: 16 },
    logContainer: { flex: 0.5, borderTopWidth: 1, borderTopColor: '#333', backgroundColor: '#000' },
    logHeader: {
        color: '#666',
        fontSize: 12,
        paddingHorizontal: 16,
        paddingVertical: 8,
        backgroundColor: '#111',
        fontWeight: 'bold',
    },
    logList: { flex: 1 },
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
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'center',
        paddingHorizontal: 16,
    },
    modalContent: {
        backgroundColor: '#1E1E1E',
        borderRadius: 12,
        flex: 1,
        overflow: 'hidden',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
    },
    modalTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    modalCloseButton: { padding: 8 },
    modalCloseText: { color: '#FF5A5F', fontWeight: 'bold' },
    contactListContent: { padding: 16 },
    contactRow: {
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#2C2C2C',
    },
    contactName: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },
    contactPhone: { color: '#888', fontSize: 13, marginTop: 4 },
});
