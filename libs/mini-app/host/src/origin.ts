const ORIGIN_PATTERN = /^(https?):\/\/(?:[^/?#@]*@)?([^/?#]+)/i;

export const originOf = (url: string | undefined): string | null => {
    const match = url ? ORIGIN_PATTERN.exec(url) : null;
    return match ? `${match[1].toLowerCase()}://${match[2].toLowerCase()}` : null;
};
