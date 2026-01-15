import { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { styles } from '../common';

import type { DetailsScreenProps } from '../navigation';

export const DetailsScreen = ({ route, navigation }: DetailsScreenProps) => {
    const { itemId, title } = route.params;
    const [inputText, setInputText] = useState('');

    return (
        <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
            <Text style={styles.title}>Details Screen</Text>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Received Params</Text>
                <Text style={styles.paramText}>Item ID: {itemId}</Text>
                <Text style={styles.paramText}>Title: {title}</Text>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Text Input Test</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Type something..."
                    value={inputText}
                    onChangeText={setInputText}
                />
                <Text style={styles.inputResult}>You typed: {inputText}</Text>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>Navigation Actions</Text>

                <TouchableOpacity
                    style={styles.navButton}
                    onPress={() => navigation.navigate('Details', { itemId: itemId + 1, title: 'New Item' })}
                >
                    <Text style={styles.navButtonText}>Go to Next Details (ID: {itemId + 1})</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.navButton, styles.navButtonGray]} onPress={() => navigation.goBack()}>
                    <Text style={styles.navButtonText}>Go Back</Text>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.navButton, styles.navButtonRed]} onPress={() => navigation.popToTop()}>
                    <Text style={styles.navButtonText}>Pop to Home</Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
};
