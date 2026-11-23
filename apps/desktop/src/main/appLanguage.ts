const DEFAULT_LANGUAGE = 'en';

export const resolveAppLanguage = (locale: string | undefined): string => {
    const subtag = (locale ?? '').trim().split(/[-_]/)[0].toLowerCase();
    return /^[a-z]{2,3}$/.test(subtag) ? subtag : DEFAULT_LANGUAGE;
};
