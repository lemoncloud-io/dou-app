import { useSyncExternalStore } from 'react';

import * as i18nextModule from 'i18next';

export const defineDebugStrings = <T>(tables: Readonly<Record<'ko' | 'en', T>>): (() => T) => {
    const current = () => tableFor(tables, source?.resolvedLanguage ?? source?.language);
    return () => useSyncExternalStore(subscribe, current, () => tables.ko);
};

const tableFor = <T>(tables: Readonly<Record<'ko' | 'en', T>>, language: string | undefined): T =>
    language?.toLowerCase().startsWith('en') ? tables.en : tables.ko;

type LanguageSource = {
    resolvedLanguage?: string;
    language?: string;
    on?: (event: 'languageChanged', listener: () => void) => void;
    off?: (event: 'languageChanged', listener: () => void) => void;
};

const source = ((i18nextModule as { default?: unknown }).default ?? i18nextModule) as LanguageSource | undefined;

const subscribe = (listener: () => void) => {
    source?.on?.('languageChanged', listener);
    return () => source?.off?.('languageChanged', listener);
};

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
