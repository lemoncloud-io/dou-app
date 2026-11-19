/**
 * What this app tells the web it can do, in `window.CHATIC_APP_CAPABILITIES`. The web chooses how to
 * reach the host from this declaration rather than from guessing at its kind, so a capability the app
 * gains or loses is a change here, not a branch in the web.
 *
 * - `checkout` (version 1): the ways this build sells a subscription, preferred first. The phone app
 *   sells through its platform's store, and never points a buyer at another way to pay — the stores'
 *   review forbids it — so the website is not listed.
 * - `media` (version 2): who picks what a person attaches. This app does, with its own picker, photo
 *   library and video conversion.
 * - `files` (version 3): who moves a message's files. This app does: its transfer module uploads and
 *   downloads in the background, keeps a downloaded file to open, save or share, and reads a video's
 *   first frame.
 * - `links`, `appShell`, `signIn`, `diagnostics`, `push` (version 4, together): who takes links out of
 *   the page, runs the frame around it (icon, badge, haptics, back, keyboard, theme and language,
 *   update), signs a person in and approves a pairing, receives the page's logs and reports, and
 *   registers the device for notifications. This app does all five.
 */
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
