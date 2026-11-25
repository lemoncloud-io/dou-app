// eslint-disable-next-line @nx/enforce-module-boundaries -- shared is web-only; the sub-webview trust rules move to a platform-free mini-app protocol package
import { subWebViewTrustOf } from '@chatic/shared/subWebViewTrust';

export const SUB_WEBVIEW_DOMAINS: readonly string[] = ['apps.chatic.io', 'apps-dev.chatic.io'];

export const isAllowedSubWebViewUrl = (url: unknown): boolean => subWebViewTrustOf(url) === 'reviewed';
