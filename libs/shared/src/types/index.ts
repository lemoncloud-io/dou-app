export interface PaginationType<T> {
    page: number | undefined;
    total: number | undefined;
    data: T;
}

export interface TokenGenerateRequest {
    cid: string;
    sid: string;
    aid: string;
    uid: string;
    mid?: string;
    gid?: string;
}

export interface TokenGenerateResponse {
    token: string;
    expiresAt?: string;
}

export interface TokenGeneratorFormState {
    cid: string;
    sid: string;
    aid: string;
    uid: string;
    mid: string;
    gid: string;
}
