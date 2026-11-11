/**
 * This page's `localStorage` or `sessionStorage`, or undefined where there is none. Reading the
 * global itself can throw (a browser with site data blocked raises SecurityError on access), and
 * that is the same answer as the global not existing.
 */
export const globalStorage = (name: 'localStorage' | 'sessionStorage'): Storage | undefined => {
    try {
        return typeof globalThis[name] === 'undefined' ? undefined : globalThis[name];
    } catch {
        return undefined;
    }
};
