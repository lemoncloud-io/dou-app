import type { ChannelView, ChatView, JoinView, ProfileDisplay, UserView } from '@lemoncloud/chatic-socials-api';
import type { CloudView, MySiteView } from '@lemoncloud/chatic-backend-api';

/** 캐시 가능한 도메인 타입 정의 */
export type CacheType = 'channel' | 'chat' | 'user' | 'join' | 'site' | 'invitecloud' | 'profile';

/** 페이징 및 리스트 처리를 위한 공통 메타데이터 */
export type PagingMeta = {
    page?: number; // 페이지 번호
    cursorNo?: number; // 커서 번호
    limit?: number; // 한 페이지당 아이템 수
    total?: number; // 전체 아이템 수
    readNo?: number; // 마지막으로 읽은 메시지 번호
    took?: number;
};

/** 캐시 만료/동기화 메타데이터 */
export type CacheTtlMeta = {
    lastSyncedAt: number;
    expiresAt: number;
};

/** 캐시 모델 공통 메타 베이스 */
export type CacheViewBase = {
    __cacheMeta?: CacheTtlMeta;
};

/** 모든 캐시 메시지의 공통 기반 필드 */
type CacheBasePayload<K extends CacheType> = {
    type: K; // 도메인 타입
    cid: string; // Cloud ID
    uid: string; // User ID;
};

/*
 * 각 CacheType이 실제로 어떤 데이터 구조를 가지는지 매핑합니다.
 */
export type CacheModelMap = {
    channel: CacheChannelView;
    chat: CacheChatView;
    invitecloud: CacheCloudView;
    join: CacheJoinView;
    site: CacheSiteView;
    user: CacheUserView;
    profile: CacheProfileView;
};

export type CacheModelOf<TType extends CacheType> = CacheModelMap[TType];
export type CacheQueryOf<TType extends CacheType> = CacheQueryMap[TType];

/** 클라우드/서버 정보 뷰 */
export type CacheCloudView = CloudView &
    CacheViewBase & {
        id: string;
        name?: string;
        backend?: string;
        wss?: string;
        cid: string;
    };

/** 채널 정보 뷰 (Site ID 포함) */
export type CacheChannelView = ChannelView &
    CacheViewBase & {
        cid: string;
        sid: string;
        isNotificationEnabled: boolean;
    };

/** 채팅 메시지 뷰 (전송 상태 포함) */
export type CacheChatView = ChatView &
    CacheViewBase & {
        cid: string;
        tempId?: string;
        isPending?: boolean; // 전송 중 여부
        isFailed?: boolean; // 전송 실패 여부
    };

/** 사이트 정보 뷰 */
export type CacheSiteView = MySiteView &
    CacheViewBase & {
        cid: string;
        order?: number;
    };

export type CacheJoinView = JoinView &
    CacheViewBase & {
        cid: string;
    };

export type CacheUserView = UserView &
    CacheViewBase & {
        cid: string;
    };

/** 플레이스(사이트)별 표시 프로필 뷰 — id = `${sid}@${uid}` */
export type CacheProfileView = ProfileDisplay &
    CacheViewBase & {
        id: string;
        cid: string;
        sid?: string;
        uid: string;
    };

/**
 * FetchAll/SaveAll 시 어떤 조건(정렬, 필터 등)으로 데이터를 식별할지 정의합니다.
 */
export type BaseQueryOptions = {
    cid?: string;
    uid?: string;
};

/** 채널 목록 조회 쿼리 */
export type ChannelQueryOptions = BaseQueryOptions & {
    sid?: string; // 특정 사이트 내 채널 필터
    keyword?: string; // 검색 키워드
};

/** 채팅 목록 조회 쿼리 */
export type ChatQueryOptions = BaseQueryOptions & {
    channelId?: string;
    sort?: 'asc' | 'desc';
    keyword?: string;
    limit?: number;
    cursorNo?: number;
};

export type InviteCloudQueryOptions = BaseQueryOptions;

/** 참여 정보 조회 쿼리 */
export type JoinQueryOptions = BaseQueryOptions & {
    channelId?: string;
    userId?: string;
};

/** 유저 정보 쿼리 */
export type UserQueryOptions = BaseQueryOptions;

/** 사이트 정보 쿼리 */
export type SiteQueryOptions = BaseQueryOptions & {
    keyword?: string; // 검색 키워드
};

/** 플레이스 프로필 쿼리 */
export type ProfileQueryOptions = BaseQueryOptions & {
    sid?: string; // 특정 사이트/플레이스 필터
};

/** 도메인별 쿼리 옵션 매핑 */
export type CacheQueryMap = {
    channel: ChannelQueryOptions;
    chat: ChatQueryOptions;
    user: UserQueryOptions;
    site: SiteQueryOptions;
    join: JoinQueryOptions;
    invitecloud: InviteCloudQueryOptions;
    profile: ProfileQueryOptions;
};

/** [요청] ID 기반 단일 데이터 조회 */
export type FetchCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string };
}[CacheType];

/** [응답] 단일 데이터 반환 (없으면 item은 null) */
export type OnFetchCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string; item: CacheModelMap[K] | null };
}[CacheType];

/** [요청] 다수/페이징 데이터 조회 (query와 meta를 조합하여 캐시 키 생성) */
export type FetchAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        query?: CacheQueryMap[K] & PagingMeta;
    };
}[CacheType];

/** [응답] 다수 데이터 반환 */
export type OnFetchAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        items: CacheModelMap[K][] | null;
        query?: CacheQueryMap[K] & PagingMeta;
    };
}[CacheType];

/** [요청] 단일 데이터 저장 */
export type SaveCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string; item: CacheModelMap[K] };
}[CacheType];

/** [응답] 단일 저장 결과 */
export type OnSaveCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string | null; success: boolean };
}[CacheType];

/** [요청] 다수 데이터 저장 (페이징 인덱싱 포함) */
export type SaveAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        query?: CacheQueryMap[K] & PagingMeta;
        items: CacheModelMap[K][];
    };
}[CacheType];

/** [응답] 다수 저장 결과 */
export type OnSaveAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & {
        ids: string[];
        success: boolean;
        query?: CacheQueryMap[K] & PagingMeta;
    };
}[CacheType];

/** [요청] 단일 삭제 */
export type DeleteCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string };
}[CacheType];

/** [응답] 단일 삭제 결과 */
export type OnDeleteCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { id: string | null; success: boolean };
}[CacheType];

/** [요청] 다수 ID 기반 삭제 */
export type DeleteAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { ids: string[] };
}[CacheType];

/** [응답] 다수 삭제 결과 */
export type OnDeleteAllCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { ids: string[]; success: boolean };
}[CacheType];

/** [요청] 특정 도메인 테이블 전체 삭제 */
export type ClearCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K>;
}[CacheType];

/** [응답] 초기화 결과 */
export type OnClearCacheDataPayload = {
    [K in CacheType]: CacheBasePayload<K> & { success: boolean };
}[CacheType];

/** [요청] 키워드 기반 전역 검색 */
export type SearchGlobalCacheDataPayload = {
    keyword: string;
    cid?: string;
    uid?: string;
};

/** [응답] 전역 검색 결과 리스트 */
export type OnSearchGlobalCacheDataPayload = {
    items: (CacheChatView | CacheChannelView | CacheSiteView)[];
};
