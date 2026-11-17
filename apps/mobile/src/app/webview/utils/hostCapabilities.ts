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
 */
export interface HostCapabilities {
    version: 3;
    checkout: Array<'apple' | 'google' | 'web'>;
    media: 'app' | 'page';
    files: 'app' | 'page';
}

export const hostCapabilities = (os: string): HostCapabilities => ({
    version: 3,
    checkout: [os === 'ios' ? 'apple' : 'google'],
    media: 'app',
    files: 'app',
});
