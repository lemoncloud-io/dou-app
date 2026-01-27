import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useQueryString } from '../utils';

import type { WSSEnvelope } from '@lemoncloud/chatic-sockets-api';
import type { AppStateStatus } from 'react-native';

interface SocketOptions<S extends Record<string, any>, P extends Record<string, any>> {
    /**
     * 서버의 생존 여부를 확인하기 위해 `ping` 메시지를 보내는 주기
     */
    pingInterval?: number;
    /**
     * `ping`을 보낸 후 `pongTimeout` 안에 서버로부터 응답이 없으면 연결 종료
     */
    pongTimeout?: number;
    /**
     * 연결이 끊어졌을 때, 재연결을 시도하기까지 대기하는 시간
     * (재시도 횟수에 따라 늘어난다.)
     */
    reconnectDelay?: number;
    /**
     * 재연결 대기 시간이 지수 백오프로 늘어날 때의 최대 상한선
     */
    maxReconnectDelay?: number;
    /**
     * 소켓 연결 요청에 대한 파라미터 객체
     */
    params?: P;

    /**
     * Ping 메시지 페이로드 (외부 주입)
     * 타입은 S (WSSEnvelope 호환)
     */
    pingPayload?: S;

    /**
     * 소켓 연결 활성화 여부
     * `false`로 설정되면 연결 즉시 종료
     */
    enabled?: boolean;
}

/**
 * T: Receive message type
 * S: Send message type
 * P: Params Type
 * @param url 타겟 url
 * @param options
 */
export const useWebSocket = <
    T = unknown,
    S extends Record<string, any> = WSSEnvelope, // 기본값을 WSSEnvelope로 설정 가능
    P extends Record<string, any> = Record<string, any>,
>(
    url: string,
    options: SocketOptions<S, P>
) => {
    const defaultPingPayload = {
        type: 'sync',
        action: 'info',
    } as unknown as S;

    const {
        pingInterval = 30_000,
        pongTimeout = 5_000,
        reconnectDelay = 3_000,
        maxReconnectDelay = 30_000,
        params = {} as P,
        enabled = true,
        pingPayload = defaultPingPayload,
    } = options;

    const queryString = useQueryString(params);
    const finalUrl = useMemo(() => {
        return queryString ? `${url}?${queryString}` : url;
    }, [url, queryString]);

    const socketRef = useRef<WebSocket | null>(null);
    const pingTimerRef = useRef<NodeJS.Timeout | null>(null);
    const pongTimerRef = useRef<NodeJS.Timeout | null>(null);
    const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

    /**
     * 재시도 횟수
     */
    const reconnectAttempts = useRef(0);

    /**
     * 강제 종료 여부
     * 강제 종료 상태일 경우 자동 재연결을 시도하지 않음
     */
    const isForceDisconnect = useRef(false);
    const appState = useRef(AppState.currentState);
    const [isConnected, setIsConnected] = useState(false);

    /**
     * 소켓 응답의 가장 마지막 메시지를 저장하는 필드
     */
    const [lastMessage, setLastMessage] = useState<T | null>(null);

    /**
     * 서버 연결 체크
     * `pingInterval`을 통해 연결 주기 설정 가능
     * `pongTimeout`내에 응답이 오지 않을 경우 연결 종료
     */
    const startHeartbeat = useCallback(() => {
        if (pingTimerRef.current) clearInterval(pingTimerRef.current);
        if (pongTimerRef.current) clearTimeout(pongTimerRef.current);

        pingTimerRef.current = setInterval(() => {
            if (socketRef.current?.readyState === WebSocket.OPEN) {
                console.log('log', '[Socket] Sending Ping...');

                sendMessage(pingPayload);

                pongTimerRef.current = setTimeout(() => {
                    console.log('warn', '[Socket] Pong timeout. Closing connection...');
                    socketRef.current?.close();
                }, pongTimeout);
            }
        }, pingInterval);
    }, [pingInterval, pongTimeout]);

    /**
     * `pongTimeout` 초기화
     *  메시지를 받게 되면 초기화 수행
     */
    const resetHeartbeat = useCallback(() => {
        if (pongTimerRef.current) {
            clearTimeout(pongTimerRef.current);
            pongTimerRef.current = null;
        }
    }, []);

    /**
     * 메모리 정리 및 변수 초기화
     */
    const cleanup = useCallback(() => {
        if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
        }
        if (pingTimerRef.current) clearInterval(pingTimerRef.current);
        if (pongTimerRef.current) clearTimeout(pongTimerRef.current);

        if (socketRef.current) {
            const ws = socketRef.current;
            socketRef.current = null;
            ws.close();
        }
        setIsConnected(false);
    }, []);

    /**
     * 강제 연결 끊기
     */
    const disconnect = useCallback(() => {
        isForceDisconnect.current = true;
        reconnectAttempts.current = 0;
        cleanup();
    }, [cleanup]);

    /**
     * 메시지 보내기
     */
    const sendMessage = useCallback((message: S) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            const payload = JSON.stringify(message);
            socketRef.current.send(payload);
            console.log('log', message, payload);
        } else {
            console.log('warn', '[Socket] Cannot send: Not connected');
        }
    }, []);

    /**
     * 소켓 연결
     */
    const connect = useCallback(() => {
        if (!url || !enabled) return;
        if (socketRef.current) return;

        isForceDisconnect.current = false;
        console.log('log', `[Socket] Connecting to: ${finalUrl}`);
        const ws = new WebSocket(finalUrl);
        socketRef.current = ws;

        ws.onopen = () => {
            console.log('log', '[Socket] Connected');
            setIsConnected(true);
            reconnectAttempts.current = 0;
            startHeartbeat();
        };

        ws.onmessage = e => {
            resetHeartbeat();
            const rawData = e.data;
            try {
                const parsedData = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
                if (typeof parsedData === 'object' && parsedData !== null) {
                    console.log('log', '[Socket] Received data:', rawData);
                    setLastMessage(parsedData as T);
                } else {
                    console.log('warn', '[Socket] Received incorrect data:', rawData);
                }
            } catch (err) {
                console.log('error', '[Socket] JSON Parse Error:', err, rawData);
            }
        };

        ws.onclose = e => {
            console.log('log', '[Socket] Closed', e);
            setIsConnected(false);

            if (socketRef.current === null) {
                return;
            }
            socketRef.current = null;

            if (pingTimerRef.current) clearInterval(pingTimerRef.current);
            if (pongTimerRef.current) clearTimeout(pongTimerRef.current);

            if (!isForceDisconnect.current && appState.current === 'active' && enabled) {
                const nextDelay = Math.min(reconnectDelay * 2 ** reconnectAttempts.current, maxReconnectDelay);
                console.log(
                    'log',
                    `[Socket] Reconnecting in ${nextDelay}ms... (Attempt ${reconnectAttempts.current + 1})`
                );

                reconnectTimerRef.current = setTimeout(() => {
                    reconnectAttempts.current += 1;
                    connect();
                }, nextDelay);
            }
        };

        ws.onerror = e => {
            console.log('log', '[Socket] Error', e);
        };
    }, [url, enabled, finalUrl, startHeartbeat, resetHeartbeat, reconnectDelay, maxReconnectDelay]);

    /**
     * 강제 연결을 끊지 않고 `enabled`가 활성화 되어있을 경우 연결
     */
    useEffect(() => {
        if (isForceDisconnect.current) return;
        if (enabled) {
            connect();
        }
        return () => {
            cleanup();
        };
    }, [enabled, finalUrl, connect, cleanup]);

    /**
     * 앱의 상태를 감지하여 소켓 연결 관리
     * 포그라운드 진입 시, 소켓 연결;
     * 백그라운드 진입 시 소켓 연걸 해제
     */
    useEffect(() => {
        const handleAppStateChange = (nextAppState: AppStateStatus) => {
            const oldState = appState.current;
            appState.current = nextAppState;

            if (oldState === 'active' && nextAppState.match(/inactive|background/)) {
                console.log('log', '[Socket] App background. Pausing connection...');
                cleanup();
            } else if (oldState.match(/inactive|background/) && nextAppState === 'active') {
                console.log('log', '[Socket] App foreground. Resuming...');

                if (enabled && !isForceDisconnect.current) {
                    reconnectAttempts.current = 0;
                    connect();
                }
            }
        };

        const subscription = AppState.addEventListener('change', handleAppStateChange);
        return () => subscription.remove();
    }, [enabled, connect, disconnect, cleanup]);

    return {
        isConnected,
        lastMessage,
        connect,
        disconnect,
        sendMessage,
    };
};
