/**
 * English translations for mobile native UI
 * This is the source of truth for the RN shell. The `push_*` keys here must stay in sync with
 * the three native locale sets under apps/mobile (ADR-0098); localeParity.test.ts checks it.
 */
export const en = {
    app: {
        exitDialog: {
            title: 'Exit App',
            message: 'Do you want to exit the app?',
            cancel: 'Cancel',
            confirm: 'Exit',
        },
        updateDialog: {
            title: 'Update Available',
            message: 'A new version is available. Please update to continue using the app with the latest features.',
            update: 'Update',
            later: 'Later',
        },
    },
    loader: {
        processing: 'Processing...',
        paymentProcessing: 'Processing payment...',
    },
    deepLink: {
        errorTitle: 'Unable to open invite link',
        errorMessage: 'The link may have expired or is no longer valid.',
        goHome: 'Go to Home',
    },
    webview: {
        loadTitle: 'Unable to load DoU',
        loadMessage: 'Check your connection and try again.',
        retry: 'Try again',
    },
    notification: {
        channel: {
            chat: 'New Messages',
            notice: 'Service Notices',
            marketing: 'Events & Promotions',
            cloud: 'Cloud',
        },
        chat: {
            title: '{0}',
            message: '{0}',
        },
    },
    push_chat_message_title: '{0}',
    push_chat_message_body: '{0}',
    push_cloud_activate_title: '{0} is ready',
    push_chat_image_body: 'Sent a photo',
    push_chat_images_body: 'Sent {0} photos',
    push_chat_video_body: 'Sent a video',
    push_chat_videos_body: 'Sent {0} videos',
    push_chat_file_body: 'Sent a file',
    push_chat_files_body: 'Sent {0} files',
    push_chat_attachments_body: 'Sent {0} attachments',
    push_chat_fallback_body: 'New message',
    push_chat_thread_message_body: '[Thread] {0}',
    push_chat_thread_image_body: '[Thread] Sent a photo',
    push_chat_thread_images_body: '[Thread] Sent {0} photos',
    push_chat_thread_video_body: '[Thread] Sent a video',
    push_chat_thread_videos_body: '[Thread] Sent {0} videos',
    push_chat_thread_file_body: '[Thread] Sent a file',
    push_chat_thread_files_body: '[Thread] Sent {0} files',
    push_chat_thread_attachments_body: '[Thread] Sent {0} attachments',
    push_chat_group_message_body: '{0}: {1}',
    push_chat_group_image_body: '{0}: Sent a photo',
    push_chat_group_images_body: '{0}: Sent {1} photos',
    push_chat_group_video_body: '{0}: Sent a video',
    push_chat_group_videos_body: '{0}: Sent {1} videos',
    push_chat_group_file_body: '{0}: Sent a file',
    push_chat_group_files_body: '{0}: Sent {1} files',
    push_chat_group_attachments_body: '{0}: Sent {1} attachments',
    push_chat_group_thread_message_body: '[Thread] {0}: {1}',
    push_chat_group_thread_image_body: '[Thread] {0}: Sent a photo',
    push_chat_group_thread_images_body: '[Thread] {0}: Sent {1} photos',
    push_chat_group_thread_video_body: '[Thread] {0}: Sent a video',
    push_chat_group_thread_videos_body: '[Thread] {0}: Sent {1} videos',
    push_chat_group_thread_file_body: '[Thread] {0}: Sent a file',
    push_chat_group_thread_files_body: '[Thread] {0}: Sent {1} files',
    push_chat_group_thread_attachments_body: '[Thread] {0}: Sent {1} attachments',
} as const;
