import type { ChatView } from '@lemoncloud/chatic-socials-api';

/**
 * 서버의 ChatView 모델을 확장한 클라이언트 전용 채팅 모델입니다.
 * 로컬 캐시 렌더링 및 UI 상태 관리에 필요한 추가 필드를 포함합니다.
 */
export interface ClientChatView extends ChatView {
    /**
     * 안 읽은 사람 수
     * (JoinView의 커서(chatNo)를 바탕으로 chatRepository에서 실시간 계산됨)
     */
    unreadCount?: number;

    /**
     * 메시지 전송 실패 여부
     * (낙관적 업데이트 후 서버 응답이 에러일 때 재전송 UI 처리를 위함)
     */
    isFailed?: boolean;

    /**
     * 임시 전송 상태 여부
     */
    isPending?: boolean;
}
