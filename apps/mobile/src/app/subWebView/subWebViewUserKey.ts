import encHex from 'crypto-js/enc-hex';
import hmacSHA256 from 'crypto-js/hmac-sha256';

/**
 * Fixed, and part of every key: changing it changes every page's key, which orphans whatever each
 * page's server keeps under the old one. It is no secret — this repository is public — so it only
 * keeps this use of the device id apart from any other. What keeps one origin's key from being
 * linked to another's is the device id itself, which a page never sees.
 */
const USER_KEY_LABEL = 'dou-sub-webview-user-key/v1';

/**
 * The key a sub WebView page on `origin` gets on this device: HMAC-SHA-256 keyed by the device id over
 * the label and the origin, as lower-case hex. One-way, so the key gives the device id away to no
 * one; keyed, so without the device id no one can tell two origins' keys belong to one device.
 */
export const deriveSubWebViewUserKey = (deviceId: string, origin: string): string =>
    hmacSHA256(`${USER_KEY_LABEL}\n${origin}`, deviceId).toString(encHex);
