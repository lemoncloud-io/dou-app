import type {
    AuthPayload,
    ChannelPayload,
    ChatErrorPayload,
    ClientSyncPayload,
    ModelSyncPayload,
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

/**
 * 백엔드의 모델 동기화 메타데이터(ModelSyncPayload)와 프론트엔드의 도메인 모델(T)을 결합한 타입입니다.
 * @template T 도메인 엔티티 타입 (예: ChatView, ChannelView)
 */
export type Synced<T> = ModelSyncPayload & Partial<T>;

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
 * 백엔드 공통 List 응답 규격입니다. (lemon-core의 ListResult 대체)
 * @template T 목록을 구성하는 개별 아이템의 타입
 * @template R 집계(Aggregation) 데이터의 타입
 */
export interface ListResult<T, R = any> {
    /** 검색된 전체 아이템 개수 */
    total?: number;
    /** 한 페이지에 포함될 수 있는 최대 아이템 개수 */
    limit?: number;
    /** 현재 페이지 번호 */
    page?: number;
    /** 검색에 소요된 시간 (초 단위, 선택) */
    took?: number;
    /** 검색된 아이템 배열 */
    list: T[];
    /** 추가적인 집계 데이터 배열 또는 객체 (선택) */
    aggr?: R | R[];
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
    /** 현재 연결된 클라우드 또는 워크스페이스의 식별자 */
    cid: string;
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
    /** 이전 대화 기록(피드) 조회 결과 */
    'chat:list': DomainPayload<ChatFeedResult>;

    // ------------------------------------------
    // 2. Join Domain (참여 정보)
    // chat:read 소켓 응답은 도메인 계층에서 join:update로 통합되어 처리됩니다.
    // ------------------------------------------
    'join:update': DomainPayload<JoinView>;
    'join:delete': DomainPayload<JoinView>;

    // ------------------------------------------
    // 3. Channel Domain (채팅방)
    // ------------------------------------------
    'channel:create': DomainPayload<ChannelView>;
    'channel:update': DomainPayload<ChannelView>;
    'channel:delete': DomainPayload<ChannelView>;
    /** 사용자가 참여 중인 채널 목록 조회 결과 (mine 대응) */
    'channel:list': DomainPayload<ListResult<ChannelView>>;

    // ------------------------------------------
    // 4. User Domain (사용자)
    // ------------------------------------------
    'user:update': DomainPayload<UserView>;
    'user:list': DomainPayload<ListResult<UserView>>;

    // ------------------------------------------
    // 5. Site Domain (사이트=플레이스)
    // ------------------------------------------
    'site:update': DomainPayload<SiteView>;
    'site:list': DomainPayload<ListResult<SiteView>>;

    // ------------------------------------------
    // 6. Auth Domain (인증)
    // ------------------------------------------
    /** 세션 갱신 등 인증 정보 업데이트 */
    'auth:update': DomainPayload<AuthPayload>;

    // ------------------------------------------
    // 7. Global Error (공통 예외 처리)
    // ------------------------------------------
    error: {
        /** 에러가 발생한 도메인 명 (예: 'chat', 'auth') */
        domain: string;
        /** 에러 상세 메시지 */
        message: string;
        /** 추적 가능한 요청인 경우의 참조 번호 */
        ref?: string;
    };
}

export type DomainEventType = keyof DomainEventMap;
