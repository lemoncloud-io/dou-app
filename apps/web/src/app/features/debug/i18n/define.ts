import { useSyncExternalStore } from 'react';

import * as i18nextModule from 'i18next';

/**
 * Turns a `ko`/`en` pair into a hook that returns the one matching the app's language.
 *
 * The panel chrome (`./index.ts`) and every screen's own table (`./screens/*`) go through here, so
 * the whole panel switches language together. Write the `en` table first and type `ko` as
 * `typeof en`: a key missing from either one then fails to compile, the same guarantee the chrome
 * table gets from `DebugScreenKey`. A value can be a function when the text has a number or a name
 * in it — `(count: number) => string` — since word order differs between the two languages.
 */
export const defineDebugStrings = <T>(tables: Readonly<Record<'ko' | 'en', T>>): (() => T) => {
    const current = () => tableFor(tables, source?.resolvedLanguage ?? source?.language);
    return () => useSyncExternalStore(subscribe, current, () => tables.ko);
};

/** Korean is the fallback: the QA docs this panel is used against are Korean. */
const tableFor = <T>(tables: Readonly<Record<'ko' | 'en', T>>, language: string | undefined): T =>
    language?.toLowerCase().startsWith('en') ? tables.en : tables.ko;

// i18next is read directly rather than through `useTranslation` so the panel does not depend on the
// app's i18n having initialised — it is mounted outside AppRuntime precisely to survive a broken
// boot. Every access is optional for the same reason: a missing or uninitialised instance means the
// Korean table, never a crashed panel.
type LanguageSource = {
    resolvedLanguage?: string;
    language?: string;
    on?: (event: 'languageChanged', listener: () => void) => void;
    off?: (event: 'languageChanged', listener: () => void) => void;
};

// Under Vite the instance is the module's default export. Under ts-jest (CommonJS, no esModuleInterop)
// the module object is the instance itself and there is no `default` — so take whichever exists.
const source = ((i18nextModule as { default?: unknown }).default ?? i18nextModule) as LanguageSource | undefined;

const subscribe = (listener: () => void) => {
    source?.on?.('languageChanged', listener);
    return () => source?.off?.('languageChanged', listener);
};

/**
 * For tests: render the panel in one language without initialising i18next. Returns the undo.
 *
 * ```ts
 * let restore: () => void;
 * beforeEach(() => { restore = setDebugLanguageForTests('en'); });
 * afterEach(() => restore());
 * ```
 */
export const setDebugLanguageForTests = (language: 'ko' | 'en'): (() => void) => {
    const target = source as { language?: string; resolvedLanguage?: string };
    const saved = { language: target.language, resolvedLanguage: target.resolvedLanguage };
    target.language = language;
    target.resolvedLanguage = language;
    return () => {
        target.language = saved.language;
        target.resolvedLanguage = saved.resolvedLanguage;
    };
};
