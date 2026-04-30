import React, { useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity } from 'react-native';

import type { RootStackParamList } from '../navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface FloatingMenuProps {
    onNavigate: (screenName: keyof RootStackParamList) => void;
}

export const FloatingMenu = ({ onNavigate }: FloatingMenuProps) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const insets = useSafeAreaInsets();

    const FAB_BOTTOM_MARGIN = 20;
    const fabBottomPosition = insets.bottom + FAB_BOTTOM_MARGIN;

    const animation = useRef(new Animated.Value(0)).current;
    const pan = useRef(new Animated.ValueXY()).current;

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
            },
            onPanResponderGrant: () => {
                pan.setOffset({
                    x: (pan.x as any)._value,
                    y: (pan.y as any)._value,
                });
                pan.setValue({ x: 0, y: 0 });
            },
            onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
                useNativeDriver: false,
            }),
            onPanResponderRelease: () => {
                pan.flattenOffset();
            },
        })
    ).current;

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
        { id: 'web', label: 'DoU 접속', target: 'Main' },
        { id: 'debug', label: '디버그 메뉴', target: 'Debug' },
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

            <Animated.View
                style={[
                    styles.draggableContainer,
                    { bottom: fabBottomPosition },
                    { transform: pan.getTranslateTransform() },
                ]}
            >
                <Animated.View style={[styles.menuItemsContainer, menuStyle, !isExpanded && { pointerEvents: 'none' }]}>
                    {menuItems.map(item => (
                        <TouchableOpacity
                            key={item.id}
                            style={styles.menuItemFab}
                            onPress={() => handlePress(item.target)}
                        >
                            <Text style={styles.menuText}>{item.label}</Text>
                        </TouchableOpacity>
                    ))}
                </Animated.View>

                <Animated.View {...panResponder.panHandlers} style={[styles.fab, isExpanded && styles.fabClose]}>
                    <TouchableOpacity
                        onPress={toggleMenu}
                        activeOpacity={0.9}
                        style={styles.touchableFab}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Animated.View style={{ transform: [{ rotate: rotation }] }}>
                            <Text style={styles.fabText}>+</Text>
                        </Animated.View>
                    </TouchableOpacity>
                </Animated.View>
            </Animated.View>
        </>
    );
};

const styles = StyleSheet.create({
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
        zIndex: 1,
    },
    draggableContainer: {
        position: 'absolute',
        left: 20,
        zIndex: 3,
    },
    fab: {
        width: 56,
        height: 56,
        borderRadius: 16,
        backgroundColor: '#1A1A1A',
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4.65,
    },
    fabClose: {
        backgroundColor: '#333',
    },
    touchableFab: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    fabText: {
        color: '#FFFFFF',
        fontSize: 30,
        fontWeight: '300',
    },
    menuItemsContainer: {
        position: 'absolute',
        left: 0,
        bottom: 70,
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
