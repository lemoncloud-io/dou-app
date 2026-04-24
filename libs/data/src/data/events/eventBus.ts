import type { DomainEventMap, SocketEventMap } from './types';

/**
 * 시스템 내의 모든 이벤트 레지스트리를 하나로 묶어 관리하는 통합 타입입니다.
 * 이벤트 버스가 처리할 수 있는 이벤트 맵의 허용 범위를 제한하여 타입 안정성을 보장합니다.
 */
export type AppEventMap = SocketEventMap | DomainEventMap;

/**
 * 제네릭 제약 조건이 적용된 범용 이벤트 버스 인터페이스입니다.
 * @template R AppEventMap에 정의된 이벤트 레지스트리 중 하나여야 합니다.
 */
export interface IEventBus<R extends AppEventMap> {
    /**
     * 특정 이벤트를 발생시키고 관련된 데이터를 리스너들에게 전달합니다.
     * @param event 발생시킬 이벤트의 이름
     * @param data 이벤트와 함께 전달할 페이로드 데이터
     */
    emit<K extends keyof R>(event: K, data: R[K]): void;

    /**
     * 특정 이벤트를 구독합니다.
     * @param event 구독할 이벤트의 이름
     * @param callback 이벤트 발생 시 실행될 콜백 함수
     * @returns 구독을 해제(Unsubscribe)할 수 있는 클린업 함수
     */
    on<K extends keyof R>(event: K, callback: (data: R[K]) => void): () => void;

    /**
     * 버스에서 발생하는 모든 이벤트를 한 번에 구독합니다.
     * @param callback 이벤트 발생 시 실행될 콜백 함수 (이벤트 이름과 데이터를 함께 받음)
     * @returns 구독을 해제(Unsubscribe)할 수 있는 클린업 함수
     */
    onAny(callback: (event: keyof R, data: any) => void): () => void;
}

/**
 * AppEventMap 규격만 허용하는 범용 이벤트 버스 구현체입니다.
 * @template R AppEventMap에 속하는 특정 이벤트 레지스트리 (예: SocketEventMap)
 */
export class EventBusEngine<R extends AppEventMap> implements IEventBus<R> {
    /** 특정 이벤트 이름에 매핑된 콜백 함수들의 리스트를 보관합니다. */
    private listeners = new Map<keyof R, Array<(data: any) => void>>();
    /** 모든 이벤를 듣는 콜백 함수들을 보관합니다. */
    private allListeners = new Set<(event: keyof R, data: any) => void>();

    /**
     * 이벤트를 발생시켜 등록된 모든 리스너들에게 데이터를 뿌려줍니다.
     * @param event 발생시킬 이벤트 키
     * @param data 전달할 데이터
     */
    public emit<K extends keyof R>(event: K, data: R[K]): void {
        const callbacks = this.listeners.get(event);

        if (callbacks) {
            /**
             * 저장된 콜백 함수를 순회하며 수행
             * slice => 인덱스 꼬임 방지
             */
            callbacks.slice().forEach(cb => {
                try {
                    cb(data);
                } catch (e) {
                    console.error(`[EventBus] ${String(event)} Error:`, e);
                }
            });
        }

        /**
         *  모든 이벤트를 수신하는 리스너 실행
         */
        this.allListeners.forEach(cb => {
            try {
                cb(event, data);
            } catch (e) {
                console.error(`[EventBus] AnyListener Error:`, e);
            }
        });
    }

    /**
     * 특정 이벤트를 구독합니다.
     * @param event 구독할 이벤트 키
     * @param callback 실행할 콜백
     * @returns 구독 해제 함수
     */
    public on<K extends keyof R>(event: K, callback: (data: R[K]) => void): () => void {
        // 해당 이벤트 키가 Map에 없으면 빈 배열로 초기화합니다.
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }

        const list = this.listeners.get(event)!;
        list.push(callback);

        /*
         * 반환된 해제 함수를 호출하면 콜백 배열에서 자신을 찾아 제거(splice)합니다.
         */
        return () => {
            const current = this.listeners.get(event);
            if (current) {
                const idx = current.indexOf(callback);
                if (idx > -1) {
                    current.splice(idx, 1);
                }

                // 해당 이벤트를 듣는 리스너가 더 이상 한 명도 없으면, 키 자체를 완전히 삭제
                if (current.length === 0) {
                    this.listeners.delete(event);
                }
            }
        };
    }

    /**
     * 모든 이벤트를 감청하는 구독을 설정합니다.
     * @param callback 실행할 범용 콜백
     * @returns 구독 해제 함수
     */
    public onAny(callback: (event: keyof R, data: any) => void): () => void {
        this.allListeners.add(callback);
        return () => this.allListeners.delete(callback);
    }
}
