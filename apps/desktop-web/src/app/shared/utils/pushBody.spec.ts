import { describe, expect, it } from 'vitest';

// Initialises i18next, so the labels read as the reader sees them.
import '../../../i18n';

import { pushBody } from './pushBody';

describe('pushBody', () => {
    it('names one attachment by its kind', () => {
        expect(pushBody({ loc_key: 'push_chat_image_body' })).toBe('Photo');
        expect(pushBody({ loc_key: 'push_chat_video_body' })).toBe('Video');
        expect(pushBody({ loc_key: 'push_chat_file_body' })).toBe('File');
    });

    // The shell forwards FCM's loc_args untouched, a JSON string; its first item used to be the
    // whole banner body, so several photos read "3".
    it('counts several from loc_args, as the JSON string FCM carries or as an array', () => {
        expect(pushBody({ loc_key: 'push_chat_images_body', loc_args: '["3"]' })).toBe('3 photos');
        expect(pushBody({ loc_key: 'push_chat_videos_body', loc_args: ['2'] })).toBe('2 videos');
        expect(pushBody({ loc_key: 'push_chat_files_body', loc_args: '[4]' })).toBe('4 files');
        expect(pushBody({ loc_key: 'push_chat_attachments_body', loc_args: '["5"]' })).toBe('5 attachments');
    });

    it('says a new message came when a count is missing or unreadable, never a bare number', () => {
        expect(pushBody({ loc_key: 'push_chat_images_body' })).toBe('New message');
        expect(pushBody({ loc_key: 'push_chat_files_body', loc_args: 'not json' })).toBe('New message');
        expect(pushBody({ loc_key: 'push_chat_files_body', loc_args: '["0"]' })).toBe('New message');
    });

    // What an attachment-only message pushes until the server picks a kind key.
    it('says a new message came when the message push has no text', () => {
        expect(pushBody({ loc_key: 'push_chat_message_body' })).toBe('New message');
        expect(pushBody({ loc_key: 'push_chat_message_body', content: '  ' })).toBe('New message');
        expect(
            pushBody({ loc_key: 'push_chat_message_body', content: JSON.stringify({ blocks: [{ type: 'divider' }] }) })
        ).toBe('New message');
    });

    it('leaves a message push with text, and any other push, to the body it arrived with', () => {
        expect(pushBody({ loc_key: 'push_chat_message_body', loc_args: '["hi"]', content: 'hi' })).toBeUndefined();
        expect(pushBody({ loc_key: 'push_cloud_activate_title' })).toBeUndefined();
        expect(pushBody({})).toBeUndefined();
    });
});
