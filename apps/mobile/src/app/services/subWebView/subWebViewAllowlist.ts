import { subWebViewTrustOf } from '@chatic/shared/subWebViewTrust';

/**
 * The domains whose subdomains are the `reviewed` tier: one subtree per backend, kept for pages the
 * app's own review pipeline deploys. A pattern rather than a list of origins, so a new page needs a
 * deploy, not an app release. The domains themselves are the hub, the `firstParty` tier.
 *
 * Deliberately not `*.chatic.io`: that would take in the web app itself (`dou.chatic.io`, which in a
 * sub WebView boots a second app and shares the first one's storage by origin), the deep-link
 * domain the main WebView's bridge trusts (`app.chatic.io`), every internal tool, and any subdomain
 * created later — including one whose DNS record outlived its service and someone else now serves.
 *
 * The rule itself lives in `@chatic/shared` (`subWebViewTrustOf`), which both shells and both webs
 * call, so the boundary is drawn once. This list mirrors that rule's own hub hosts for this app's
 * docs and tests; the rule does not read it, so changing it here changes nothing.
 */
export const SUB_WEBVIEW_DOMAINS: readonly string[] = ['apps.chatic.io', 'apps-dev.chatic.io'];

/**
 * Whether `url` is a reviewed page: `https://<label>.<domain>` for one of the domains, with a single
 * label — the domain itself is the hub, not a reviewed page. Anything a parser could read two ways is
 * refused.
 */
export const isAllowedSubWebViewUrl = (url: unknown): boolean => subWebViewTrustOf(url) === 'reviewed';
