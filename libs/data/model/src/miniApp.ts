export type DomainMiniAppStatus = 'active' | 'inactive' | 'held';

export interface DomainMiniApp {
    id: string;
    name: string;
    url: string;
    enabled: boolean;
    status: DomainMiniAppStatus;
}

export interface MiniAppInput {
    name: string;
    url: string;
    enabled?: boolean;
}

export type MiniAppPatch = Partial<MiniAppInput>;
