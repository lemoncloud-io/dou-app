import { useCallback, useRef } from 'react';

interface SwipeHandlers {
    onSwipeLeft?: () => void;
    onSwipeRight?: () => void;
}

interface TouchState {
    startX: number;
    startY: number;
    startTime: number;
}

const SWIPE_THRESHOLD = 50;
const SWIPE_VELOCITY_THRESHOLD = 0.3;

export const useSwipe = ({ onSwipeLeft, onSwipeRight }: SwipeHandlers) => {
    const touchState = useRef<TouchState | null>(null);

    const onTouchStart = useCallback((e: React.TouchEvent) => {
        const touch = e.touches[0];
        touchState.current = {
            startX: touch.clientX,
            startY: touch.clientY,
            startTime: Date.now(),
        };
    }, []);

    const onTouchEnd = useCallback(
        (e: React.TouchEvent) => {
            if (!touchState.current) return;

            const touch = e.changedTouches[0];
            const deltaX = touch.clientX - touchState.current.startX;
            const deltaY = touch.clientY - touchState.current.startY;
            const deltaTime = Date.now() - touchState.current.startTime;

            // Ignore if vertical swipe is more significant
            if (Math.abs(deltaY) > Math.abs(deltaX)) {
                touchState.current = null;
                return;
            }

            const velocity = Math.abs(deltaX) / deltaTime;
            const isValidSwipe = Math.abs(deltaX) > SWIPE_THRESHOLD || velocity > SWIPE_VELOCITY_THRESHOLD;

            if (isValidSwipe) {
                if (deltaX > 0) {
                    onSwipeRight?.();
                } else {
                    onSwipeLeft?.();
                }
            }

            touchState.current = null;
        },
        [onSwipeLeft, onSwipeRight]
    );

    return {
        onTouchStart,
        onTouchEnd,
    };
};
