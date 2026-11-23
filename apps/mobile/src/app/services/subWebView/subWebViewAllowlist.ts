import { subWebViewTrustOf } from '@chatic/shared/subWebViewTrust';

export const SUB_WEBVIEW_DOMAINS: readonly string[] = ['apps.chatic.io', 'apps-dev.chatic.io'];

export const isAllowedSubWebViewUrl = (url: unknown): boolean => subWebViewTrustOf(url) === 'reviewed';
