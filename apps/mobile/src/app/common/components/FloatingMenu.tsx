import React, { useRef, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity } from 'react-native';

import type { RootStackParamList } from '../../navigation';

interface FloatingMenuProps {
    onNavigate: (screenName: keyof RootStackParamList) => void;
}

export const FloatingMenu = ({ onNavigate }: FloatingMenuProps) => {
    const [isExpanded, setIsExpanded] = useState(false);

    const animation = useRef(new Animated.Value(0)).current;

    const toggleMenu = () => {
        const toValue = isExpanded ? 0 : 1;

        Animated.spring(animation, {
            toValue,
            useNativeDriver: true,
            friction: 5,
            tension: 40,
        }).start();

        setIsExpanded(!isExpanded);
    };

    const handlePress = (screenName: keyof RootStackParamList) => {
        onNavigate(screenName);
        toggleMenu();
    };

    const menuItems: { id: string; label: string; target: keyof RootStackParamList }[] = [
        { id: 'web', label: 'Main Screen', target: 'Main' },
        { id: 'debug', label: 'Debug Menu Screen', target: 'Debug' },
    ];

    const menuStyle = {
        opacity: animation,
        transform: [
            { scale: animation },
            {
                translateY: animation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                }),
            },
        ],
    };

    const rotation = animation.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '45deg'],
    });

    return (
        <>
            {isExpanded && <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={toggleMenu} />}

            <Animated.View style={[styles.menuItemsContainer, menuStyle, !isExpanded && { pointerEvents: 'none' }]}>
                {menuItems.map(item => (
                    <TouchableOpacity key={item.id} style={styles.menuItemFab} onPress={() => handlePress(item.target)}>
                        <Text style={styles.menuText}>{item.label}</Text>
                    </TouchableOpacity>
                ))}
            </Animated.View>

            <TouchableOpacity
                style={[styles.fab, isExpanded && styles.fabClose]}
                onPress={toggleMenu}
                activeOpacity={0.9}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
                <Animated.View style={{ transform: [{ rotate: rotation }] }}>
                    <Text style={styles.fabText}>+</Text>
                </Animated.View>
            </TouchableOpacity>
        </>
    );
};

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
        zIndex: 1,
    },
    fab: {
        position: 'absolute',
        left: 20,
        bottom: 40,
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: '#1A1A1A',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        zIndex: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
    },
    fabClose: {
        backgroundColor: '#333',
    },
    fabText: {
        color: '#FFFFFF',
        fontSize: 30,
        fontWeight: '300',
    },
    menuItemsContainer: {
        position: 'absolute',
        left: 20,
        bottom: 110,
        alignItems: 'flex-start',
        zIndex: 2,
    },
    menuItemFab: {
        backgroundColor: 'white',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        marginBottom: 12,
        elevation: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        minWidth: 120,
    },
    menuText: {
        color: '#1A1A1A',
        fontWeight: '600',
        fontSize: 15,
    },
});
