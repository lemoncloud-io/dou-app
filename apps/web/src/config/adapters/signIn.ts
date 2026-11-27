import { webClient } from '@chatic/bridges';
import { browserSignIn } from '@chatic/host-web-browser';
import { mobileShellSignIn } from '@chatic/host-web-mobile-shell';
import { signInAdapters } from '@chatic/runtime-hybrid-web';
import type { ShellOrBrowserImplementations } from '@chatic/runtime-hybrid-web';

export const webSignIn: ShellOrBrowserImplementations<'signIn'> = {
    shell: mobileShellSignIn(webClient),
    browser: browserSignIn,
};

export const { host: signInHost, shell: signInShell, browser: signInBrowser } = signInAdapters(webSignIn);
