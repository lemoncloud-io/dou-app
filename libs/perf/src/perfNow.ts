export const perfNow = (): number =>
    typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
