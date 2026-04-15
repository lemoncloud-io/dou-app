import type { ChannelView, ChatView } from '@lemoncloud/chatic-socials-api';

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
    /**
     * from ChatView.createdAt
     */
    timestamp: Date;

    /**
     * 시스템 메시지 여부
     */
    isSystem: boolean;

    /**
     * 메시지 작성자
     */
    ownerName: string;

    /**
     * 나의 채팅인지에 대한 여부
     */
    isOwner: boolean;
}

/**
 * 서버의 ChannelView 모델을 확장한 클라이언트 전용 채널 모델입니다.
 * UI 렌더링에 자주 쓰이는 파생 상태들을 미리 계산하여 포함합니다.
 */
export interface ClientChannelView extends ChannelView {
    /** 현재 로그인한 사용자가 방장인지 여부 */
    isOwner: boolean;
    /** 나와의 채팅방(self)인지 여부 */
    isSelfChat: boolean;
    /** 채널 참여 인원 수 */
    memberCount: number;
    /** 읽지 않은 채팅 개수 */
    unreadCount: number;
}
