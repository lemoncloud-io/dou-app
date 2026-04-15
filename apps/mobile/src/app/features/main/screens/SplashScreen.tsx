import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import LottieView from 'lottie-react-native';

interface SplashScreenProps {
    onFinish: () => void;
}

export const SplashScreen = ({ onFinish }: SplashScreenProps) => {
    const animationRef = useRef<LottieView>(null);

    return (
        <View style={styles.container}>
            <LottieView
                ref={animationRef}
                source={require('../../../../assets/splash.json')}
                autoPlay
                loop={false}
                resizeMode="contain"
                onAnimationFinish={onFinish}
                style={styles.animation}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
    },
    animation: {
        width: '100%',
        aspectRatio: 1,
        height: undefined,
    },
});
