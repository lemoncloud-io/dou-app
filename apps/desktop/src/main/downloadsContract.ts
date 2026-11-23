export const DOWNLOAD_DONE_CHANNEL = 'chatic-download:done';

export const DOWNLOAD_REVEAL_CHANNEL = 'chatic-download:reveal';

export interface DownloadDone {
    id?: string;
    name: string;
    state: 'completed' | 'interrupted';
}
