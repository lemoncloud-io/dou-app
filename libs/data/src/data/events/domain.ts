import type { ChannelView, ChatView, JoinView, SiteView, UserView } from '@lemoncloud/chatic-socials-api';

/**
 * 도메인 계층으로 전달되는 데이터를 위한 가벼운 래퍼(Wrapper)입니다.
 * 순수 도메인 엔티티(T)를 오염시키지 않으면서, 클라이언트 요청에 대한 응답을 추적하기 위한 ref 값을 전달합니다.
 * @template T 순수 도메인 엔티티 또는 결과 타입
 */
export interface DomainPayload<T> {
    /** 정제된 순수 도메인 데이터 */
    data: T;
    /** 요청 발신 시 부여했던 추적용 참조 번호 (서버 응답 시 매핑됨) */
    ref?: string;
}

/**
 * 도메인 이벤트 집합
 * DataSource 계층에서 인프라 껍데기(SocketEventDetail, Synced)를 벗겨내고 가공한 순수 도메인 이벤트 규격입니다.
 * Repository 계층은 이 규격만을 구독하여 비즈니스 로직을 처리합니다.
 */
export interface DomainEventMap {
    // ------------------------------------------
    // 1. Chat Domain (메시지)
    // ------------------------------------------
    'chat:create': DomainPayload<ChatView>;
    'chat:update': DomainPayload<ChatView>;
    'chat:delete': DomainPayload<ChatView>;

    // ------------------------------------------
    // 2. Join Domain (참여 정보)
    // chat:read 소켓 응답은 도메인 계층에서 join:update로 통합되어 처리됩니다.
    // ------------------------------------------
    'join:update': DomainPayload<JoinView>;
    'join:delete': DomainPayload<JoinView>;
    'join:create': DomainPayload<JoinView>;

    // ------------------------------------------
    // 3. Channel Domain (채팅방)
    // ------------------------------------------
    'channel:create': DomainPayload<ChannelView>;
    'channel:update': DomainPayload<ChannelView>;
    'channel:delete': DomainPayload<ChannelView>;

    // ------------------------------------------
    // 4. User Domain (사용자)
    // ------------------------------------------
    'user:create': DomainPayload<UserView>;
    'user:update': DomainPayload<UserView>;
    'user:delete': DomainPayload<UserView>;

    // ------------------------------------------
    // 5. Place Domain (구 Site — 동일 개념)
    // ------------------------------------------
    'place:create': DomainPayload<SiteView>;
    'place:update': DomainPayload<SiteView>;
    'place:delete': DomainPayload<SiteView>;

    // ------------------------------------------
    // 6. Auth Domain (인증)
    // ------------------------------------------
    'auth:create': DomainPayload<any>;
    'auth:update': DomainPayload<any>;
    'auth:delete': DomainPayload<any>;

    // ------------------------------------------
    // 7. Device Domain (디바이스)
    // ------------------------------------------
    'device:create': DomainPayload<any>;
    'device:update': DomainPayload<any>;
    'device:delete': DomainPayload<any>;

    // ------------------------------------------
    // 8. Socket Domain (소켓)
    // ------------------------------------------
    'socket:create': DomainPayload<any>;
    'socket:update': DomainPayload<any>;
    'socket:delete': DomainPayload<any>;

    // ------------------------------------------
    // 9. Connection Domain (연결)
    // ------------------------------------------
    'connection:create': DomainPayload<any>;
    'connection:update': DomainPayload<any>;
    'connection:delete': DomainPayload<any>;
}

export type DomainEventType = keyof DomainEventMap;
