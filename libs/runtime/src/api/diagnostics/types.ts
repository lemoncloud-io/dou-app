export type AppType = 'web' | 'admin' | 'mobile';

export interface IssueReportOrigin {
    hasShellBridge: () => boolean;
    pageUrl: () => string;
}

export interface IssueReportExtras {
    device?: Record<string, unknown>;
    version?: Record<string, unknown>;
    online?: boolean;
    viewport?: { width: number; height: number };
    path?: string;
    routeTrail?: string[];
    images?: string[];
}
