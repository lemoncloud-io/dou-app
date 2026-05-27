import type { IDeeplinkRoutingService } from './types';
import type { ILogService } from '../log';

/**
 * DeeplinkRoutingService
 *
 * 시스템 알림 배너 또는 로컬 알림 팝업을 클릭했을 때의 클릭 이벤트를 통합 수집하여 관리하는 허브 서비스입니다.
 * 원시 FCM 데이터 페이로드(예: { type: 'chat', channelId: 'ch_1' })를 일관된 단일 웹 스키마 URL(예: '/chats/ch_1')로 변환한 후,
 * 버퍼링 기능이 탑재된 네이티브 `DeepLinkManager`를 통해 안전하게 웹뷰 페이지 전환을 완성하도록 역할을 조율합니다.
 */
export class DeeplinkRoutingService implements IDeeplinkRoutingService {
    constructor(private readonly logger: ILogService) {}

    /**
     * 알림 클릭 이벤트 발생 시 네이티브 화면 전환 매핑 로직을 대행합니다.
     * @param data 알림 페이로드 데이터 딕셔너리
     */
    async handleNotificationClick(data: Record<string, string | object> | undefined): Promise<void> {
        if (!data) {
            this.logger.warn('DEEPLINK', 'No notification click data received.');
            return;
        }

        // TODO: 기획 및 사양 확정 시 푸시 클릭 페이로드를 웹 URL 주소로 변환하여
        // 네이티브 딥링크 매니저(getDeepLinkManager().handleUrl(url))로 넘기는 로직 연동부.
        // 현재는 상세 딥링크 규격이 정해지지 않아 덤프 로그만 출력하고 실행을 안전하게 지연시킵니다.
        this.logger.info(
            'DEEPLINK',
            `[TODO] Push notification click received. Routing deferred. Raw payload: ${JSON.stringify(data)}`
        );
    }
}
