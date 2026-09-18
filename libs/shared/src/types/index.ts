export interface PaginationType<T> {
    page: number | undefined;
    total: number | undefined;
    data: T;
}

// ============================================================================
// Token Generation Types
// ============================================================================

/**
 * Request payload for generating test JWT token
 */
export interface TokenGenerateRequest {
    /** Cloud ID (AWS AccountNo) */
    cid: string;
    /** Site ID (place; defaults to 0000) */
    sid: string;
    /** Auth ID (auth-related; uuid) */
    aid: string;
    /** User ID (user info) */
    uid: string;
    /** Member ID (member info = user info) - optional */
    mid?: string;
    /** Group ID (group info) - optional */
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
