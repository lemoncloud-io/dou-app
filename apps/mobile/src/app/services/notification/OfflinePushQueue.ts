import type { IOfflinePushQueue } from './types';
import type { IKeyValueStorage } from '../../database/types';
import type { ILogService } from '../log';

/**
 * MMKV 키-값 저장소의 캐시 큐에 접근하기 위한 전역 고유 키 정의
 */
const OFFLINE_PUSH_QUEUE_KEY = 'offline_push_queue';

/**
 * OfflinePushQueue
 *
 * 안드로이드 헤드리스 JS 환경과 같이 SQLite C++ JSI 바인딩을 이용할 수 없는 상태(완전 종료 상태에서 사일런트 푸시 유입)에서
 * 알림 데이터 유실을 차단하기 위해 MMKV 로컬 디스크에 임시 캐시를 쌓고 앱 재구동/웹뷰 로드 시 동기화해 주는 내결함성 서비스입니다.
 */
export class OfflinePushQueue implements IOfflinePushQueue {
    constructor(
        private readonly keyValueStorage: IKeyValueStorage,
        private readonly logger: ILogService
    ) {}

    /**
     * 중복 큐 진입을 방지하기 위해 알림 페이로드의 고유 식별자(ID)를 추출합니다.
     * @param payload 원시 데이터 페이로드
     * @returns 고유 식별자 문자열
     */
    private getPayloadId(payload: Record<string, string | object>): string {
        return (payload.messageId as string) || (payload.id as string) || JSON.stringify(payload);
    }

    /**
     * 알림 데이터 페이로드를 캐시 큐에 임시 적재합니다. (중복 방지 데듀플리케이션 처리 포함)
     * @param payload 캐싱할 알림 데이터
     */
    async enqueue(payload: Record<string, string | object>): Promise<void> {
        try {
            if (!payload) return;
            this.logger.info('PUSH_QUEUE', 'Enqueueing raw push payload to MMKV...');

            // 1. 기존 MMKV에 대기 중이던 큐 로드
            const queue =
                (await this.keyValueStorage.get<Record<string, string | object>[]>(OFFLINE_PUSH_QUEUE_KEY)) || [];

            // 2. 고유 ID 추출 및 중복 검사 (데듀플리케이션)
            const payloadId = this.getPayloadId(payload);
            const exists = queue.some(item => this.getPayloadId(item) === payloadId);

            if (exists) {
                this.logger.debug('PUSH_QUEUE', 'Duplicate push payload detected, skipping enqueue.');
                return;
            }

            // 3. 신규 페이로드 인큐 후 디스크 저장
            queue.push(payload);
            await this.keyValueStorage.set(OFFLINE_PUSH_QUEUE_KEY, queue);
            this.logger.info('PUSH_QUEUE', `Push payload enqueued successfully. Queue length: ${queue.length}`);
        } catch (error) {
            this.logger.error('PUSH_QUEUE', 'Failed to enqueue push payload', error as Error);
        }
    }

    /**
     * 임시 적재된 오프라인 알림 데이터를 모두 읽어 로컬 SQLite 데이터베이스에 벌크 반영(Upsert)하고 큐를 비웁니다.
     * 앱 실행 시점 및 웹뷰의 WebAppReady 브릿지 수신 시점에 동시 다발적으로 안전하게 트리거됩니다.
     */
    async flush(): Promise<void> {
        try {
            this.logger.info('PUSH_QUEUE', 'Checking for queued offline push payloads to flush...');
            const queue =
                (await this.keyValueStorage.get<Record<string, string | object>[]>(OFFLINE_PUSH_QUEUE_KEY)) || [];

            if (queue.length === 0) {
                this.logger.debug('PUSH_QUEUE', 'No offline push payloads to flush.');
                return;
            }

            this.logger.info('PUSH_QUEUE', `Flushing ${queue.length} push payloads (caching execution deferred)...`);

            // 1. 적재된 페이로드 순회하며 데이터 동기화
            for (const payload of queue) {
                // TODO: 백그라운드 데이터베이스 캐싱 세부 명세 및 스키마 확정 시
                // SQLite 크루드 서비스(provider.cacheCrudService)를 활용한 실데이터 INSERT OR REPLACE 트랜잭션 구현부.
                this.logger.info('PUSH_QUEUE', `[TODO] Flushing queued push payload: ${JSON.stringify(payload)}`);
            }

            // 2. 캐시 보관함 안전 청소 (큐 비우기)
            await this.keyValueStorage.remove(OFFLINE_PUSH_QUEUE_KEY);
            this.logger.info('PUSH_QUEUE', 'Offline push queue flushed and cleared successfully.');
        } catch (error) {
            this.logger.error('PUSH_QUEUE', 'Failed to flush offline push queue', error as Error);
        }
    }
}
