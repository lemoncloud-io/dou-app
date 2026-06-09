import { logger } from '@chatic/bridges';
import type { IEventBus } from '../../events/eventBus';
import type { DomainEventMap } from '../../events/types';

/**
 * 대기 중인 비동기 소켓 요청의 제어권을 보관하기 위한 제네릭 인터페이스입니다.
 * @template T - 서버로부터 응답받을 데이터의 예상 타입
 */
interface PendingRequest<T = any> {
    resolve: (data: T) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
}

/**
 * 이벤트 버스에서 가로챈 상세 데이터의 공통 규격을 정의하는 제네릭 인터페이스입니다.
 * @template T - 이벤트 페이로드 내 실제 데이터의 타입
 */
interface InterceptedDetail<T = any> {
    ref?: string;
    data?: T;
    message?: string;
}

export interface ISocketRequestManager {
    request<T>(sendAction: (ref: string) => void, customRef?: string, timeoutMs?: number): Promise<T>;
}

/**
 * 소켓 발신에 대한 비동기 응답을 추적하고, 이를 동기적(Promise) 흐름으로 제어하는 매니저 클래스입니다.
 */
export class SocketRequestManager implements ISocketRequestManager {
    // 다양한 응답 타입을 하나의 Map에서 관리하기 위해 내부적으로 제네릭 기본값을 활용합니다.
    private pendingRequests = new Map<string, PendingRequest>();

    /**
     * @param domainEventBus - 시스템 전역에서 사용되는 도메인 계층 이벤트 버스
     */
    constructor(private readonly domainEventBus: IEventBus<DomainEventMap>) {
        this.initializeInterceptor();
    }

    /**
     * 도메인 이벤트 버스의 모든 이벤트를 감시하여, 현재 대기 중인 요청의 응답을 가로챕니다.
     */
    private initializeInterceptor() {
        this.domainEventBus.onAny((eventName: string, rawDetail: any) => {
            const detail = rawDetail as InterceptedDetail;

            // 유효한 참조자(ref)가 없거나, 현재 매니저가 대기 중인 요청이 아니라면 무시
            if (!detail || !detail.ref || !this.pendingRequests.has(detail.ref)) {
                return;
            }

            const { resolve, reject, timer } = this.pendingRequests.get(detail.ref)!;

            // 응답이 도착하였으므로 타임아웃 타이머 해제
            clearTimeout(timer);

            // 이벤트 명칭이 'error'인 경우 에러로 간주하여 Promise를 즉시 Reject 처리
            if (eventName === 'error') {
                reject(new Error(detail.message || `Request Error ${detail}`));
            } else {
                // 정상적인 응답인 경우 추출된 데이터를 Promise Resolve로 반환
                resolve(detail.data);
            }

            // 처리가 완료된 요청은 메모리 대기열에서 제거
            this.pendingRequests.delete(detail.ref);
        });
    }

    /**
     * 소켓 발신 로직을 Promise로 감싸주어, 응답을 동기적으로 대기할 수 있도록 지원하는 메서드입니다.
     * * @template T - 응답으로 기대하는 반환 데이터의 타입
     * @param sendAction - 실제 소켓 발신을 수행할 콜백 함수 (생성되거나 주입된 고유 ref를 주입받습니다)
     * @param customRef - (선택) 외부에서 주입할 참조자. **logical request마다 고유해야 합니다** —
     *   서버는 이 ref를 mid로 echo하고, 인터셉터는 ref가 일치하는 첫 도메인 이벤트로 Promise를
     *   resolve하므로, 두 동시 요청이 같은 ref를 쓰면 응답이 교차 매칭됩니다. 주입하지 않으면
     *   내부에서 고유 ref를 생성합니다. (idempotent 재전송은 의도적으로 같은 ref 재사용)
     * @param timeoutMs - 타임아웃 제한 시간 (기본값: 30s)
     * @returns {Promise} 서버로부터 수신된 결과 데이터
     */
    public request<T>(sendAction: (ref: string) => void, customRef?: string, timeoutMs = 30_000): Promise<T> {
        return new Promise((resolve, reject) => {
            // 외부 주입 ref가 존재하면 사용하고, 없으면 기존처럼 자동 생성합니다.
            const ref = customRef || `req-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

            // 같은 ref가 이미 in-flight면 set()이 이전 항목을 덮어써 그 Promise가 영영
            // resolve되지 않고 timeout까지 샙니다. customRef 비고유가 원인 — 조기 발견용 경고.
            if (this.pendingRequests.has(ref)) {
                logger.warn(
                    'SOCKET_REQ',
                    `[SocketRequestManager] 중복 in-flight ref "${ref}" — caller ref는 요청마다 고유해야 합니다. 이전 요청이 leak/timeout 됩니다.`
                );
            }

            // 지정된 시간이 초과되면 대기열에서 제거하고 타임아웃 에러를 발생시킵니다.
            const timer = setTimeout(() => {
                this.pendingRequests.delete(ref);
                reject(new Error('서버 응답 시간 초과 (Timeout)'));
            }, timeoutMs);

            // 해당 참조자에 대한 Promise 제어권을 대기열에 저장합니다.
            this.pendingRequests.set(ref, {
                resolve: resolve as (data: unknown) => void,
                reject,
                timer,
            });

            // 결정된 참조자를 포함하여 사용자가 주입한 실제 발신 함수를 실행합니다.
            sendAction(ref);
        });
    }
}
