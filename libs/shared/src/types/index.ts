export interface ListResult<T, R = any> {
    /**
     * total searched count
     */
    total?: number;
    /**
     * max items count in the page
     */
    limit?: number;
    /**
     * current page number.
     */
    page?: number;
    /**
     * (optional) time took in sec
     */
    took?: number;
    /**
     * items searched
     */
    list: T[];
    /**
     * (optional) aggr list
     */
    aggr?: R[];
}

export interface PaginationType<T> {
    page: number | undefined;
    total: number | undefined;
    data: T;
}

export declare type Params = {
    [key: string]: any;
};

// ============================================================================
// Token Generation Types
// ============================================================================

/**
 * Request payload for generating test JWT token
 */
export interface TokenGenerateRequest {
    /** Cloud ID (AWS AccountNo) */
    cid: string;
    /** Site ID (플레이스; 기본 0000) */
    sid: string;
    /** Auth ID (인증관련; uuid) */
    aid: string;
    /** User ID (유저정보) */
    uid: string;
    /** Member ID (멤버정보=유저정보) - optional */
    mid?: string;
    /** Group ID (그룹정보) - optional */
    gid?: string;
}

/**
 * Response from token generation API
 */
export interface TokenGenerateResponse {
    /** Generated JWT token */
    token: string;
    /** Token expiration timestamp (ISO 8601) */
    expiresAt?: string;
}

/**
 * Form state for token generation modal
 */
export interface TokenGeneratorFormState {
    cid: string;
    sid: string;
    aid: string;
    uid: string;
    mid: string;
    gid: string;
}
