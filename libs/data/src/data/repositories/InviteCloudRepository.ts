import type { CacheCloudView } from '@chatic/app-messages';

/**
 * InviteCloud Repository의 공개 계약입니다.
 * 현재 단계에서는 7번 요구사항에 따라 구현체와 LocalDataSource 의존성 없이 인터페이스만 둡니다.
 */
export interface IInviteCloudRepository {
    /** 초대 cloud 정보를 로컬 저장소에 저장합니다. */
    saveInvite(id: string, invite: CacheCloudView): Promise<void>;
    /** 단일 초대 cloud 정보를 조회합니다. */
    getInvite(id: string): Promise<CacheCloudView | null>;
    /** 저장된 모든 초대 cloud 정보를 조회합니다. */
    getInvites(): Promise<CacheCloudView[]>;
    /** 단일 초대 cloud 정보를 삭제합니다. */
    deleteInvite(id: string): Promise<void>;
    /** 초대 cloud 로컬 저장소를 비웁니다. */
    clearAll(): Promise<void>;
}
