import { formatPushCopy } from './formatPushCopy';

describe('formatPushCopy', () => {
    // What the server sends for each attachment case, and what the banner should then say.
    const ATTACHMENT_CASES = [
        { key: 'push_chat_image_body', args: undefined, ko: '사진을 보냈습니다', en: 'Sent a photo' },
        { key: 'push_chat_images_body', args: ['3'], ko: '사진 3장을 보냈습니다', en: 'Sent 3 photos' },
        { key: 'push_chat_video_body', args: undefined, ko: '동영상을 보냈습니다', en: 'Sent a video' },
        { key: 'push_chat_videos_body', args: ['2'], ko: '동영상 2개를 보냈습니다', en: 'Sent 2 videos' },
        { key: 'push_chat_file_body', args: undefined, ko: '파일을 보냈습니다', en: 'Sent a file' },
        { key: 'push_chat_files_body', args: ['3'], ko: '파일 3개를 보냈습니다', en: 'Sent 3 files' },
        { key: 'push_chat_attachments_body', args: ['3'], ko: '첨부 3개를 보냈습니다', en: 'Sent 3 attachments' },
    ] as const;

    it.each(ATTACHMENT_CASES)('builds $key in both languages', ({ key, args, ko, en }) => {
        expect(formatPushCopy(key, args, 'ko')).toBe(ko);
        expect(formatPushCopy(key, args, 'en')).toBe(en);
    });

    it('takes loc_args as an APNs array or as an FCM-style JSON string', () => {
        expect(formatPushCopy('push_chat_images_body', ['4'], 'en')).toBe('Sent 4 photos');
        expect(formatPushCopy('push_chat_images_body', '["4"]', 'en')).toBe('Sent 4 photos');
        expect(formatPushCopy('push_chat_images_body', [4], 'en')).toBe('Sent 4 photos');
    });

    it('keeps a text message body as the text', () => {
        expect(formatPushCopy('push_chat_message_body', ['hello'], 'ko')).toBe('hello');
    });

    // Today's payload for an attachment-only message: the text key, and no args at all.
    it('turns a body whose placeholder got no arg into the fallback copy', () => {
        expect(formatPushCopy('push_chat_message_body', undefined, 'ko')).toBe('새 메시지');
        expect(formatPushCopy('push_chat_message_body', [], 'en')).toBe('New message');
        expect(formatPushCopy('push_chat_images_body', 'not json', 'en')).toBe('New message');
    });

    it('strips an unfilled title placeholder instead of falling back', () => {
        expect(formatPushCopy('push_cloud_activate_title', undefined, 'en', 'title')).toBe('is ready');
        expect(formatPushCopy('push_chat_message_title', undefined, 'en', 'title')).toBe('');
        expect(formatPushCopy('push_chat_message_title', ['Raine'], 'en', 'title')).toBe('Raine');
    });

    it('shows an arg that looks like a placeholder verbatim', () => {
        expect(formatPushCopy('push_chat_message_body', ['use {0} here'], 'en')).toBe('use {0} here');
        expect(formatPushCopy('push_chat_message_body', ['see {1}'], 'en')).toBe('see {1}');
    });

    // The rollout signal: a payload that outran this build must stay visible, not be papered over.
    it('returns a key this build does not know as the key itself', () => {
        expect(formatPushCopy('push_chat_sticker_body', ['1'], 'ko')).toBe('push_chat_sticker_body');
    });

    it('gives nothing for no key, and English for a language without copy', () => {
        expect(formatPushCopy(undefined, ['x'], 'ko')).toBe('');
        expect(formatPushCopy('', ['x'], 'ko')).toBe('');
        expect(formatPushCopy('push_chat_image_body', undefined, 'ja')).toBe('Sent a photo');
    });
});
