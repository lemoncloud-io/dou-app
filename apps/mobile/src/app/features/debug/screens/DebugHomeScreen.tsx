import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { FEATURE_TEST_MENU_SECTION, type DebugOverlayScreenKey } from '../debugMenu';
import { useDebugTheme } from '../theme';

interface DebugHomeScreenProps {
    onSelect: (screen: DebugOverlayScreenKey) => void;
}

export const DebugHomeScreen = ({ onSelect }: DebugHomeScreenProps) => {
    const colors = useDebugTheme();

    const renderMenuItem = (key: string, title: string, onPress: () => void) => (
        <TouchableOpacity
            key={key}
            style={[styles.menuItem, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}
            onPress={onPress}
            activeOpacity={0.7}
        >
            <Text style={[styles.menuText, { color: colors.text }]}>{title}</Text>
            <Text style={[styles.menuArrow, { color: colors.subtleText }]}>{'>'}</Text>
        </TouchableOpacity>
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: colors.subtleText }]}>
                        {FEATURE_TEST_MENU_SECTION.title}
                    </Text>
                    {FEATURE_TEST_MENU_SECTION.items.map(item =>
                        renderMenuItem(item.key, item.title, () => onSelect(item.key))
                    )}
                </View>
            </ScrollView>
        </View>
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
    section: {
        marginBottom: 20,
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
        borderBottomWidth: 1,
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
