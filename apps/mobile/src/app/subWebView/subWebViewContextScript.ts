import type { SubWebViewContext } from '@chatic/bridge-messages';

import { originOf } from '../utils/url';

export const buildSubWebViewContextScript = (context: SubWebViewContext, openedUrl: string): string => {
    const literal = (value: unknown) =>
        JSON.stringify(value)
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');
    return `(function () {
    if (window.location.origin !== ${literal(originOf(openedUrl))}) return;
    if (Object.prototype.hasOwnProperty.call(window, 'ChaticSubWebView')) return;
    var freeze = function (value) {
        if (value && typeof value === 'object') {
            Object.keys(value).forEach(function (key) { freeze(value[key]); });
            Object.freeze(value);
        }
        return value;
    };
    Object.defineProperty(window, 'ChaticSubWebView', {
        value: freeze(JSON.parse(${literal(JSON.stringify(context))})),
        enumerable: true,
        writable: false,
        configurable: false,
    });
})();
true;`;
};
