import type {
    AuthPayload,
    ChannelPayload,
    ChatErrorPayload,
    ClientSyncPayload,
    SystemPayload,
} from '@lemoncloud/chatic-sockets-api';
import type {
    ChannelView,
    ChatFeedResult,
    ChatView,
    JoinView,
    SiteView,
    UserView,
} from '@lemoncloud/chatic-socials-api';

import type { ListResult, Synced } from './common';

/**
 * 인프라 계층: 서버로부터 웹소켓을 통해 수신되는 원시 데이터의 표준 래퍼(Wrapper) 규격입니다.
 * @template T 실제 비즈니스 페이로드 데이터의 타입
 */
export interface SocketEventDetail<T> {
    /** 현재 연결된 클라우드 또는 워크스페이스의 식별자 */
    cid: string;
    /** 클라이언트가 발신한 요청과 서버의 응답을 매핑하기 위한 추적용 참조 번호 (선택) */
    ref?: string;
    /** 서버 스펙에 정의된 실제 전달 데이터 */
    payload: T;
    /** 처리 중 발생한 에러 메시지 (에러 이벤트인 경우 존재) */
    error?: string;
}

/**
 * 소켓 이벤트 집합
 * 웹소켓 디스패처가 수신하는 모든 원시 이벤트의 명칭과 데이터 규격을 정의합니다.
 * 해당 집합은 RemoteDataSource 계층에서 구독하여 도메인 이벤트로 변환하는 데 사용됩니다.
 */
export interface SocketEventMap {
    // ------------------------------------------
    // 1. Chat (메시지 및 동기화)
    // ------------------------------------------
    'chat:create': SocketEventDetail<Synced<ChatView>>;
    'chat:read': SocketEventDetail<JoinView>;
    'chat:feed': SocketEventDetail<ChatFeedResult>;
    'chat:update': SocketEventDetail<Synced<ChatView>>;
    'chat:delete': SocketEventDetail<Synced<ChatView>>;
    'chat:error': SocketEventDetail<ChatErrorPayload>;

    // ------------------------------------------
    // 2. Channel (채팅방 관리)
    // ------------------------------------------
    'channel:read': SocketEventDetail<ListResult<ChannelView>>;
    'channel:create': SocketEventDetail<Synced<ChannelView>>;
    'channel:update': SocketEventDetail<Synced<ChannelView>>;
    'channel:delete': SocketEventDetail<Synced<ChannelView>>;
    'channel:subscribe': SocketEventDetail<ChannelPayload>;
    'channel:unsubscribe': SocketEventDetail<ChannelPayload>;
    'channel:error': SocketEventDetail<ChatErrorPayload>;

    // ------------------------------------------
    // 3. Join (채팅방 참여 정보)
    // ------------------------------------------
    'join:create': SocketEventDetail<Synced<JoinView>>;
    'join:update': SocketEventDetail<Synced<JoinView>>;
    'join:delete': SocketEventDetail<Synced<JoinView>>;
    'join:error': SocketEventDetail<ChatErrorPayload>;

    // ------------------------------------------
    // 4. User (사용자 프로필 및 초대)
    // ------------------------------------------
    'user:read': SocketEventDetail<ListResult<UserView>>;
    'user:create': SocketEventDetail<Synced<UserView>>;
    'user:update': SocketEventDetail<Synced<UserView>>;
    'user:delete': SocketEventDetail<Synced<UserView>>;
    'user:invite': SocketEventDetail<UserView>;
    'user:error': SocketEventDetail<ChatErrorPayload>;

    // ------------------------------------------
    // 5. Site (워크스페이스/사이트)
    // ------------------------------------------
    'site:read': SocketEventDetail<ListResult<SiteView>>;
    'site:create': SocketEventDetail<SiteView>;
    'site:update': SocketEventDetail<SiteView>;
    'site:error': SocketEventDetail<ChatErrorPayload>;

    // ------------------------------------------
    // 6. Auth & System (인증 및 시스템 인프라)
    // ------------------------------------------
    'auth:update': SocketEventDetail<AuthPayload>;
    'auth:error': SocketEventDetail<AuthPayload | ChatErrorPayload>;
    'sync:update': SocketEventDetail<ClientSyncPayload>;
    'system:ping': SocketEventDetail<SystemPayload>;
    'system:info': SocketEventDetail<SystemPayload>;
    'system:error': SocketEventDetail<SystemPayload | ChatErrorPayload>;
}

export type SocketEventType = keyof SocketEventMap;
