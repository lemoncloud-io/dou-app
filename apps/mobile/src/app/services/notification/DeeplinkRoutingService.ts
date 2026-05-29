import { getDeepLinkManager } from '@chatic/deeplinks';
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

        this.logger.info('DEEPLINK', `Push notification click received. Raw payload: ${JSON.stringify(data)}`);

        // 1. 페이로드 내부에서 직접적인 URL 추출 시도 (deeplink, url, link 등)
        const rawUrl = data.deeplink || data.url || data.link;
        if (typeof rawUrl === 'string' && rawUrl.trim().length > 0) {
            this.logger.info('DEEPLINK', `Routing via DeepLinkManager with extracted URL: ${rawUrl}`);
            await getDeepLinkManager().handleUrl(rawUrl);
            return;
        }

        // 알림 데이터에 라우팅 경로가 없는 경우 경고 로그 출력
        this.logger.warn('DEEPLINK', `No routing target found in notification payload: ${JSON.stringify(data)}`);
    }
}
