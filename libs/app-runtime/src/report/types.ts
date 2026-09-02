// ============================================================================
// Issue Report Types
// @see clipbiz-backend-api@0.26.103
// ============================================================================

export type AppType = 'web' | 'admin' | 'mobile';

/**
 * Optional context a user-facing issue report can attach on top of the base
 * `reportIssue` payload (user/cloud/env/url). Kept loosely typed so this lib
 * stays decoupled from the app's log/device modules — the caller (apps/web
 * issue-report feature) composes and passes a concrete shape.
 */
export interface IssueReportExtras {
    /** Device snapshot (platform, model, stage, ...). */
    device?: Record<string, unknown>;
    /** Version snapshot (appVersion, webVersion, ...). */
    version?: Record<string, unknown>;
    /** navigator.onLine at report time. */
    online?: boolean;
    /** Viewport size at report time. */
    viewport?: { width: number; height: number };
    /** Current route path at report time. */
    path?: string;
    /**
     * Recently visited route paths, oldest first. The report screen is reached from a menu, so
     * `path` alone says nothing about where the user hit the problem — the entry before the last
     * one does.
     */
    routeTrail?: string[];
    /**
     * User-attached screenshots as base64 JPEG data URLs.
     *
     * Rides in the payload like the rest, but their size changes how the report is
     * sent: the payload is also the Slack message text, and one image blows past its
     * ~40k character limit, so `reportIssue` sends a report carrying images with
     * `silent: true` — stored, not announced. @see ADR-0049
     */
    images?: string[];
}
