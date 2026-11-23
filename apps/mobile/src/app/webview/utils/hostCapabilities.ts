export interface HostCapabilities {
    version: 4;
    checkout: Array<'apple' | 'google' | 'web'>;
    media: 'shell' | 'browser';
    files: 'shell' | 'browser';
    links: 'shell' | 'browser';
    appShell: 'shell' | 'browser';
    signIn: 'shell' | 'browser';
    diagnostics: 'shell' | 'browser';
    push: 'shell' | 'browser';
}

export const hostCapabilities = (os: string): HostCapabilities => ({
    version: 4,
    checkout: [os === 'ios' ? 'apple' : 'google'],
    media: 'shell',
    files: 'shell',
    links: 'shell',
    appShell: 'shell',
    signIn: 'shell',
    diagnostics: 'shell',
    push: 'shell',
});
