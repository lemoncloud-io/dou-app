export interface AuthSession {
    id: string;
    userId: string;
    deviceId: string;
    status: 'active' | 'inactive';
    createdAt: number;
    updatedAt: number;
}

export interface AuthSessionListParams {
    page?: number;
    limit?: number;
    userId?: string;
}

export interface AuthSessionListResult {
    items: AuthSession[];
    total: number;
    page: number;
    limit: number;
}

// find-alias
export interface FindAliasBody {
    type: 'email';
    alias: string;
}

export interface FindAliasView {
    hasUser: boolean;
}

// verify-alias
export interface VerifyAliasBody {
    type: 'email';
    mode: 'find' | 'signup';
    step: 'send' | 'resend' | 'check' | 'change' | 'confirm';
    alias: string;
    userId?: string;
    code?: string;
    password?: string;
}

export interface VerifyAliasView {}
