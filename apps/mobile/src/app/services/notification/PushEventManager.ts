import type { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import type { IPushEventManager } from './types';
import type { ILogService } from '../log';

/**
 * PushEventManager
 *
 * 최하단 네이티브 알림 채널과 하이브리드 웹뷰 브릿지(`useFcmHandler`) 사이를 유연하게 디커플링하는 싱글톤 이벤트 리스너 레지스트리입니다.
 * 웹뷰 라이프사이클과 모바일 구동 시점의 시간 차(Race condition)에 의한 푸시 누락을 방지하고 다중 옵저버 콜백 전파를 관리합니다.
 */
export class PushEventManager implements IPushEventManager {
    /**
     * 포그라운드 수신 이벤트를 전파받기 위해 등록된 모든 관찰자 콜백의 집합
     */
    private readonly receiveListeners = new Set<(message: FirebaseMessagingTypes.RemoteMessage) => void>();

    constructor(private readonly logger: ILogService) {}

    /**
     * 포그라운드에서 실시간 푸시 수신 시 전파받을 리스너를 추가합니다.
     * @param callback 알림 메시지를 처리할 관찰자 콜백 핸들러
     * @returns 등록된 콜백 리스너를 다시 안전하게 삭제하기 위한 구독 해제(Unsubscribe) 함수
     */
    onReceiveNotification(callback: (message: FirebaseMessagingTypes.RemoteMessage) => void): () => void {
        this.receiveListeners.add(callback);
        this.logger.debug('PUSH_EVENT', 'Registered OnReceiveNotification listener.');
        return () => {
            this.receiveListeners.delete(callback);
            this.logger.debug('PUSH_EVENT', 'Unregistered OnReceiveNotification listener.');
        };
    }

    /**
     * 감지된 포그라운드 푸시 메시지를 등록된 모든 웹뷰 브릿지 리스너에게 멀티캐스팅 전파(Emit)합니다.
     * 예외 발생 리스너가 존재하더라도 다른 구독자들의 전파 실행이 보장됩니다.
     * @param message 전파할 원본 Firebase RemoteMessage 객체
     */
    emitReceiveNotification(message: FirebaseMessagingTypes.RemoteMessage): void {
        this.logger.info('PUSH_EVENT', `Emitting OnReceiveNotification to ${this.receiveListeners.size} listeners`);
        this.receiveListeners.forEach(listener => {
            try {
                listener(message);
            } catch (err) {
                this.logger.error('PUSH_EVENT', 'Error in OnReceiveNotification listener callback', err as Error);
            }
        });
    }
}
