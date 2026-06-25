import type { NavigateOptions } from 'react-router-dom';

type NavigateFn = (path: string | number, opts?: NavigateOptions) => void;

let _navigate: NavigateFn | null = null;

export const bindGlobalNavigate = (fn: NavigateFn): void => {
    _navigate = fn;
};

export const globalNavigate = (path: string | number, opts?: NavigateOptions): void => {
    _navigate?.(path, opts);
};
