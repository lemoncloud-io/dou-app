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
