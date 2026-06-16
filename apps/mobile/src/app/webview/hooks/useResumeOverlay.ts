import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * iOS WKWebView 백그라운드 복귀 시 흰 화면을 방지하기 위한
 * 테마 색상 오버레이(ResumeOverlay)의 표시 및 해제 라이프사이클을 관리하는 훅입니다.
 * (Android의 경우 해당 현상이 없으므로 동작하지 않습니다.)
 */
export const useResumeOverlay = () => {
    const [showResumeOverlay, setShowResumeOverlay] = useState(false);
    const resumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const dismissOverlay = useCallback(() => {
        if (resumeTimeoutRef.current) {
            clearTimeout(resumeTimeoutRef.current);
            resumeTimeoutRef.current = null;
        }
        setShowResumeOverlay(false);
    }, []);

    useEffect(() => {
        if (Platform.OS !== 'ios') {
            return;
        }

        const subscription = AppState.addEventListener('change', nextState => {
            if (nextState === 'background' || nextState === 'inactive') {
                if (resumeTimeoutRef.current) {
                    clearTimeout(resumeTimeoutRef.current);
                }
                setShowResumeOverlay(true);
            } else if (nextState === 'active') {
                // Fallback: 웹앱이 DismissResumeOverlay 신호를 안 보낼 경우(예: 웹 프로세스 중지 등) 최대 1.5초 후 강제 해제
                if (resumeTimeoutRef.current) {
                    clearTimeout(resumeTimeoutRef.current);
                }
                resumeTimeoutRef.current = setTimeout(() => {
                    setShowResumeOverlay(false);
                }, 1500);
            }
        });

        return () => {
            subscription.remove();
            if (resumeTimeoutRef.current) {
                clearTimeout(resumeTimeoutRef.current);
            }
        };
    }, []);

    return {
        showResumeOverlay,
        dismissOverlay,
    };
};
