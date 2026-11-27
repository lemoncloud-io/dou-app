// eslint-disable-next-line @nx/enforce-module-boundaries -- host-mobile still reads its link and store-URL helpers from web-only shared until they move to a platform-free package
import { CUSTOM_SCHEMES, DEEP_LINK_DOMAINS } from '@chatic/host-mobile/links';
import { originOf } from '../../utils/url';

export const isTrustedBridgeUrl = (pageUrl: string | undefined, baseUrl: string): boolean => {
    const origin = originOf(pageUrl);
    if (!origin) return false;
    return origin === originOf(baseUrl) || DEEP_LINK_DOMAINS.some(host => origin === `https://${host}`);
};

const OPENABLE_SCHEMES: readonly string[] = ['http', 'https', 'mailto', 'tel', 'sms', ...CUSTOM_SCHEMES];

export const isOpenableUrl = (url: unknown): boolean => {
    const scheme = typeof url === 'string' ? /^([a-z][a-z\d+\-.]*):/i.exec(url)?.[1]?.toLowerCase() : undefined;
    return !!scheme && OPENABLE_SCHEMES.includes(scheme);
};
