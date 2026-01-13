import { useState } from 'react';
import { Alert, Button, ScrollView, Switch, Text, TouchableOpacity, View } from 'react-native';

import { styles } from '../common/style';

import type { SettingsScreenProps } from '../navigation/types';

export const SettingsScreen = ({ navigation }: SettingsScreenProps) => {
    const [notifications, setNotifications] = useState(true);
    const [darkMode, setDarkMode] = useState(false);
    const [autoSave, setAutoSave] = useState(true);

    return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
            <Text style={styles.title}>Settings Screen</Text>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Preferences</Text>

                <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>Notifications</Text>
                    <Switch
                        value={notifications}
                        onValueChange={setNotifications}
                        trackColor={{ false: '#767577', true: '#81b0ff' }}
                    />
                </View>

                <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>Dark Mode</Text>
                    <Switch
                        value={darkMode}
                        onValueChange={setDarkMode}
                        trackColor={{ false: '#767577', true: '#81b0ff' }}
                    />
                </View>

                <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>Auto Save</Text>
                    <Switch
                        value={autoSave}
                        onValueChange={setAutoSave}
                        trackColor={{ false: '#767577', true: '#81b0ff' }}
                    />
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Actions</Text>

                <Button title="Show Alert" onPress={() => Alert.alert('Settings', 'Settings saved!')} />

                <View style={styles.spacer} />

                <Button title="Clear Cache" color="#FF6B6B" onPress={() => Alert.alert('Cache', 'Cache cleared!')} />
            </View>

            <View style={styles.section}>
                <TouchableOpacity style={[styles.navButton, styles.navButtonGray]} onPress={() => navigation.goBack()}>
                    <Text style={styles.navButtonText}>Go Back</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
};
