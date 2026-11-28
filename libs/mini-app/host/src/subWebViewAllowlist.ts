import { subWebViewTrustOf } from '@chatic/mini-app-protocol';

export const SUB_WEBVIEW_DOMAINS: readonly string[] = ['apps.chatic.io', 'apps-dev.chatic.io'];

export const isAllowedSubWebViewUrl = (url: unknown): boolean => subWebViewTrustOf(url) === 'reviewed';
