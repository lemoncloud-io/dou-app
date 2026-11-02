import { useConfigValue } from '@chatic/config/react';

/** A page deployed for trying the sub WebView, as the Lab lists it. */
export interface SubWebViewLabPage {
    /** Shown as the row's title, and the subdomain it lives on. */
    name: string;
    url: string;
}

/**
 * The pages kept on `apps-dev.chatic.io` for trying the sub WebView. Built and deployed outside this
 * repository; the shell's allowlist takes any one-label subdomain there, so a new page needs only a
 * line here.
 */
export const SUB_WEBVIEW_LAB_PAGES: readonly SubWebViewLabPage[] = [
    { name: 'sample', url: 'https://sample.apps-dev.chatic.io/' },
    { name: 'sample1', url: 'https://sample1.apps-dev.chatic.io/' },
];

/** The pages, in a development build only (`feature.lab.subWebViewPages`); empty otherwise. */
export const useSubWebViewLabPages = (): readonly SubWebViewLabPage[] =>
    useConfigValue<boolean>('feature.lab.subWebViewPages') === true ? SUB_WEBVIEW_LAB_PAGES : [];
