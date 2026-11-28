import { webClient } from '@chatic/bridges';
import { desktopBrowserSignIn, desktopShellSignIn } from '@chatic/host-web-desktop-shell';
import { signInAdapters } from '@chatic/runtime-hybrid-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

export const desktopSignIn: ShellOrBrowserImplementations<'signIn'> = {
    shell: desktopShellSignIn(webClient),
    browser: desktopBrowserSignIn,
};

export const { host: signInHost, shell: signInShell, browser: signInBrowser } = signInAdapters(desktopSignIn);
