import { useState } from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';

import { styles } from '../common/style';

import type { HomeScreenProps } from '../../../navigation';

export const HomeScreen = ({ navigation }: HomeScreenProps) => {
    const [count, setCount] = useState(0);

    return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
            <Text style={styles.title}>Home Screen</Text>
            <Text style={styles.subtitle}>React Native 0.83 + Navigation</Text>

            {/* Counter Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Counter Test</Text>
                <Text style={styles.counterText}>{count}</Text>
                <View style={styles.row}>
                    <TouchableOpacity style={[styles.button, styles.buttonRed]} onPress={() => setCount(c => c - 1)}>
                        <Text style={styles.buttonText}>- 1</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.button, styles.buttonGreen]} onPress={() => setCount(c => c + 1)}>
                        <Text style={styles.buttonText}>+ 1</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Navigation Section */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Navigation Test</Text>

                <TouchableOpacity
                    style={styles.navButton}
                    onPress={() => navigation.navigate('Details', { itemId: 42, title: 'First Item' })}
                >
                    <Text style={styles.navButtonText}>Go to Details (ID: 42)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.navButton}
                    onPress={() => navigation.navigate('Details', { itemId: 100, title: 'Second Item' })}
                >
                    <Text style={styles.navButtonText}>Go to Details (ID: 100)</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.navButton, styles.navButtonPurple]}
                    onPress={() => navigation.navigate('Settings')}
                >
                    <Text style={styles.navButtonText}>Go to Settings</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.navButton, styles.navButtonOrange]}
                    onPress={() => navigation.navigate('Profile', { userId: 'user123', name: 'John Doe' })}
                >
                    <Text style={styles.navButtonText}>Go to Profile</Text>
                </TouchableOpacity>
            </View>

            {/* Color Boxes */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Touch Test</Text>
                <View style={styles.colorRow}>
                    {['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7'].map((color, i) => (
                        <TouchableOpacity
                            key={i}
                            style={[styles.colorBox, { backgroundColor: color }]}
                            onPress={() => Alert.alert('Color', color)}
                        />
                    ))}
                </View>
            </View>
        </ScrollView>
    );
};
