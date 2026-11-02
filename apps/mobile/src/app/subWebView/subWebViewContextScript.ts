import type { SubWebViewContext } from '@chatic/app-messages';

import { originOf } from '../utils/url';

/**
 * The script run before the page's own: defines `window.ChaticSubWebView` for the origin the view was
 * opened on and no other. The script runs on every top-level load in the view, so a page that
 * navigates to another allowlisted origin finds nothing there — `params` were meant for the first one.
 *
 * - The context is parsed from a JSON string rather than written as an object literal, so a
 *   `"__proto__"` key in `params` stays a key instead of becoming the object's prototype.
 * - It is frozen all the way down, and the property can be neither reassigned nor redefined.
 * - Android runs it twice (before content loads, which on Android does not always precede the
 *   page's first script, and again when the load ends); the second run finds it defined and stops.
 * - The two line separators JSON allows in a string and older JavaScript parsers do not are escaped.
 */
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
