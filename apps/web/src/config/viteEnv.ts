export const readBuildValue = (name: string): string | undefined =>
    (import.meta.env as Record<string, string | undefined>)[name];

export const sessionMirrorDisabled = (): boolean => import.meta.env.VITE_SESSION_MIRROR_DISABLED === 'true';
