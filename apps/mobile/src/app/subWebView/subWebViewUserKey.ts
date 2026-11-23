import encHex from 'crypto-js/enc-hex';
import hmacSHA256 from 'crypto-js/hmac-sha256';

const USER_KEY_LABEL = 'dou-sub-webview-user-key/v1';

export const deriveSubWebViewUserKey = (deviceId: string, origin: string): string =>
    hmacSHA256(`${USER_KEY_LABEL}\n${origin}`, deviceId).toString(encHex);
