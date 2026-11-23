export const homeAddress = (baseUrl: string, homeSearch: string | null | undefined): string => {
    const search = homeSearch?.replace(/^\?/, '');
    if (!baseUrl || !search) return baseUrl;
    return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${search}`;
};
