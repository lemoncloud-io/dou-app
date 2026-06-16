/**
 * English translations for mobile native UI
 * This is the source of truth - web JSON should match these keys
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
        cloud: {
            sync_complete: "Cloud '{0}' created successfully",
        },
    },
    push_chat_message_title: '{0}',
    push_chat_message_body: '{0}',
} as const;
