export const globalStorage = (name: 'localStorage' | 'sessionStorage'): Storage | undefined => {
    try {
        return typeof globalThis[name] === 'undefined' ? undefined : globalThis[name];
    } catch {
        return undefined;
    }
};
