import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { type RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { AppWebView } from '../../../common';
import type { ModalScreenParams } from '../../../navigation';

type ModalScreenRouteProp = RouteProp<{ params: ModalScreenParams }, 'params'>;

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const ModalScreen = () => {
    const navigation = useNavigation();
    const route = useRoute<ModalScreenRouteProp>();

    const { url, type, heightRatio, dragHandle } = route.params;
    const isSheet: boolean = type === 'sheet';
    const panY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    /**
     * - 시트 높이 비율; 기본 값 0.9
     * - full 시트는 높이 비율 관계없이 최대 높이로 고정
     */
    const targetRatio: number = isSheet ? (heightRatio ?? 0.9) : 1;
    const sheetHeight: number = SCREEN_HEIGHT * targetRatio;

    useEffect(() => {
        Animated.timing(panY, {
            toValue: 0,
            useNativeDriver: true,
            duration: 300,
        }).start();
    }, [panY]);

    const closeModal = () => {
        Animated.timing(panY, {
            toValue: SCREEN_HEIGHT,
            useNativeDriver: true,
            duration: 250,
        }).start(() => {
            navigation.goBack();
        });
    };

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) => {
                return Math.abs(gestureState.dy) > 5;
            },

            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    panY.setValue(gestureState.dy);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 150 || gestureState.vy > 0.5) {
                    closeModal();
                } else {
                    Animated.spring(panY, {
                        toValue: 0,
                        useNativeDriver: true,
                        bounciness: 10,
                    }).start();
                }
            },
        })
    ).current;

    return (
        <View style={styles.overlay}>
            {isSheet && <Pressable style={styles.backdrop} onPress={closeModal} />}

            <Animated.View
                style={[
                    styles.container,
                    { transform: [{ translateY: panY }] },
                    isSheet
                        ? {
                              height: sheetHeight,
                              borderTopLeftRadius: 20,
                              borderTopRightRadius: 20,
                          }
                        : {
                              height: sheetHeight,
                              borderRadius: 0,
                          },
                ]}
            >
                {isSheet && dragHandle && (
                    <View style={styles.handleContainer} {...panResponder.panHandlers}>
                        <View style={styles.handle} />
                    </View>
                )}

                <View style={styles.webviewContainer}>
                    <AppWebView source={{ uri: url }} />
                </View>
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'flex-end',
        backgroundColor: 'rgba(0,0,0,0)',
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    container: {
        backgroundColor: 'white',
        width: '100%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 5,
        elevation: 10,
        overflow: 'hidden',
    },
    handleContainer: {
        alignItems: 'center',
        paddingVertical: 12,
        backgroundColor: 'transparent',
        width: '100%',
    },
    handle: {
        width: 40,
        height: 5,
        backgroundColor: '#ccc',
        borderRadius: 2.5,
    },
    webviewContainer: {
        flex: 1,
    },
});
