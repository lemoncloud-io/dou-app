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

    // The room shape rides on the body key: a 1:1 reply, a group message and a group reply each get
    // their own key per body kind, and the group ones carry the sender as the first arg. Built with the
    // assembler as it is — the shape changes the copy, not the code.
    const ROOM_SHAPE_CASES = [
        { key: 'push_chat_thread_message_body', args: ['hi'], ko: '[스레드] hi', en: '[Thread] hi' },
        {
            key: 'push_chat_thread_image_body',
            args: undefined,
            ko: '[스레드] 사진을 보냈습니다',
            en: '[Thread] Sent a photo',
        },
        {
            key: 'push_chat_thread_images_body',
            args: ['3'],
            ko: '[스레드] 사진 3장을 보냈습니다',
            en: '[Thread] Sent 3 photos',
        },
        {
            key: 'push_chat_thread_video_body',
            args: undefined,
            ko: '[스레드] 동영상을 보냈습니다',
            en: '[Thread] Sent a video',
        },
        {
            key: 'push_chat_thread_videos_body',
            args: ['2'],
            ko: '[스레드] 동영상 2개를 보냈습니다',
            en: '[Thread] Sent 2 videos',
        },
        {
            key: 'push_chat_thread_file_body',
            args: undefined,
            ko: '[스레드] 파일을 보냈습니다',
            en: '[Thread] Sent a file',
        },
        {
            key: 'push_chat_thread_files_body',
            args: ['3'],
            ko: '[스레드] 파일 3개를 보냈습니다',
            en: '[Thread] Sent 3 files',
        },
        {
            key: 'push_chat_thread_attachments_body',
            args: ['3'],
            ko: '[스레드] 첨부 3개를 보냈습니다',
            en: '[Thread] Sent 3 attachments',
        },
        { key: 'push_chat_group_message_body', args: ['Sunny', 'hi'], ko: 'Sunny : hi', en: 'Sunny: hi' },
        {
            key: 'push_chat_group_image_body',
            args: ['Sunny'],
            ko: 'Sunny : 사진을 보냈습니다',
            en: 'Sunny: Sent a photo',
        },
        {
            key: 'push_chat_group_images_body',
            args: ['Sunny', '3'],
            ko: 'Sunny : 사진 3장을 보냈습니다',
            en: 'Sunny: Sent 3 photos',
        },
        {
            key: 'push_chat_group_video_body',
            args: ['Sunny'],
            ko: 'Sunny : 동영상을 보냈습니다',
            en: 'Sunny: Sent a video',
        },
        {
            key: 'push_chat_group_videos_body',
            args: ['Sunny', '2'],
            ko: 'Sunny : 동영상 2개를 보냈습니다',
            en: 'Sunny: Sent 2 videos',
        },
        {
            key: 'push_chat_group_file_body',
            args: ['Sunny'],
            ko: 'Sunny : 파일을 보냈습니다',
            en: 'Sunny: Sent a file',
        },
        {
            key: 'push_chat_group_files_body',
            args: ['Sunny', '3'],
            ko: 'Sunny : 파일 3개를 보냈습니다',
            en: 'Sunny: Sent 3 files',
        },
        {
            key: 'push_chat_group_attachments_body',
            args: ['Sunny', '3'],
            ko: 'Sunny : 첨부 3개를 보냈습니다',
            en: 'Sunny: Sent 3 attachments',
        },
        {
            key: 'push_chat_group_thread_message_body',
            args: ['Sunny', 'hi'],
            ko: '[스레드] Sunny : hi',
            en: '[Thread] Sunny: hi',
        },
        {
            key: 'push_chat_group_thread_image_body',
            args: ['Sunny'],
            ko: '[스레드] Sunny : 사진을 보냈습니다',
            en: '[Thread] Sunny: Sent a photo',
        },
        {
            key: 'push_chat_group_thread_images_body',
            args: ['Sunny', '3'],
            ko: '[스레드] Sunny : 사진 3장을 보냈습니다',
            en: '[Thread] Sunny: Sent 3 photos',
        },
        {
            key: 'push_chat_group_thread_video_body',
            args: ['Sunny'],
            ko: '[스레드] Sunny : 동영상을 보냈습니다',
            en: '[Thread] Sunny: Sent a video',
        },
        {
            key: 'push_chat_group_thread_videos_body',
            args: ['Sunny', '2'],
            ko: '[스레드] Sunny : 동영상 2개를 보냈습니다',
            en: '[Thread] Sunny: Sent 2 videos',
        },
        {
            key: 'push_chat_group_thread_file_body',
            args: ['Sunny'],
            ko: '[스레드] Sunny : 파일을 보냈습니다',
            en: '[Thread] Sunny: Sent a file',
        },
        {
            key: 'push_chat_group_thread_files_body',
            args: ['Sunny', '3'],
            ko: '[스레드] Sunny : 파일 3개를 보냈습니다',
            en: '[Thread] Sunny: Sent 3 files',
        },
        {
            key: 'push_chat_group_thread_attachments_body',
            args: ['Sunny', '3'],
            ko: '[스레드] Sunny : 첨부 3개를 보냈습니다',
            en: '[Thread] Sunny: Sent 3 attachments',
        },
    ] as const;

    it.each(ROOM_SHAPE_CASES)('builds $key in both languages', ({ key, args, ko, en }) => {
        expect(formatPushCopy(key, args, 'ko')).toBe(ko);
        expect(formatPushCopy(key, args, 'en')).toBe(en);
    });

    // A group key whose args stop short of its placeholders is the same hole as a text key with no
    // args: the fallback, not a sender name with nothing after it.
    it('falls back when a group shape gets fewer args than it names', () => {
        expect(formatPushCopy('push_chat_group_message_body', ['Sunny'], 'ko')).toBe('새 메시지');
        expect(formatPushCopy('push_chat_group_thread_images_body', ['Sunny'], 'en')).toBe('New message');
        expect(formatPushCopy('push_chat_group_image_body', undefined, 'en')).toBe('New message');
    });

    it('takes a group shape two args as an APNs array or as an FCM-style JSON string', () => {
        expect(formatPushCopy('push_chat_group_message_body', ['Sunny', 'hi'], 'en')).toBe('Sunny: hi');
        expect(formatPushCopy('push_chat_group_message_body', '["Sunny","hi"]', 'en')).toBe('Sunny: hi');
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
        expect(formatPushCopy('push_cloud_activate_title', undefined, 'en', 'title')).toBe(
            '[Cloud]  has been created.'
        );
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
