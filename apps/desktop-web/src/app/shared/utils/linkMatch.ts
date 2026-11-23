export const LINK_URL_SOURCE = 'https?:\\/\\/[^\\s]+';

const LABELLED_ADDRESS_SOURCE = 'https?:\\/\\/[^\\s()/?#][^\\s()]*';

export const LABELLED_LINK_SOURCE = `\\[([^\\[\\]\\n]+)\\]\\((${LABELLED_ADDRESS_SOURCE})\\)`;

const LABELLED_ADDRESS = new RegExp(`^${LABELLED_ADDRESS_SOURCE}$`);

export const isLabelledLinkAddress = (url: string): boolean => LABELLED_ADDRESS.test(url);

export const toLabelledLinkWords = (words: string): string =>
    words
        .replace(/\[/g, '(')
        .replace(/\]/g, ')')
        .replace(/\s*\n\s*/g, ' ');
