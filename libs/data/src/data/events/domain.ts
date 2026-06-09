import type { AuthPayload } from '@lemoncloud/chatic-sockets-api';
import type { MyInviteView } from '@lemoncloud/chatic-backend-api';
import type {
    ChannelView,
    ChatFeedResult,
    ChatView,
    JoinView,
    ProfileView,
    SiteProfileSyncView,
    SiteView,
    UserView,
} from '@lemoncloud/chatic-socials-api';

import type { ListResult } from './common';

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
    /** 이전 대화 기록(피드) 조회 결과 */
    'chat:list': DomainPayload<ChatFeedResult>;

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
    /** 사용자가 참여 중인 채널 목록 조회 결과 (mine 대응) */
    'channel:list': DomainPayload<ListResult<ChannelView>>;

    // ------------------------------------------
    // 4. User Domain (사용자)
    // ------------------------------------------
    'user:create': DomainPayload<UserView>;
    'user:update': DomainPayload<UserView>;
    'user:delete': DomainPayload<UserView>;
    'user:invite': DomainPayload<MyInviteView>;
    'user:invite-batch': DomainPayload<MyInviteView[]>;
    'user:list': DomainPayload<ListResult<UserView>>;

    // ------------------------------------------
    // 5. Site Domain (사이트=플레이스)
    // ------------------------------------------
    'site:create': DomainPayload<SiteView>;
    'site:update': DomainPayload<SiteView>;
    'site:list': DomainPayload<ListResult<SiteView>>;

    // ------------------------------------------
    // 6. Profile Domain (플레이스별 표시 프로필)
    // ------------------------------------------
    /** 본인 플레이스 프로필 조회 결과 (get-site-profile) */
    'profile:get': DomainPayload<ProfileView>;
    /** 본인 플레이스 프로필 변경 결과 (set-site-profile) */
    'profile:update': DomainPayload<ProfileView>;
    /** 도달 가능한 사용자들의 플레이스 프로필 동기화 delta (sync-site-profile) */
    'profile:sync': DomainPayload<SiteProfileSyncView>;

    // ------------------------------------------
    // 7. Auth Domain (인증)
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
