import type { PolicyContent } from './policyTypes';

export const PRIVACY_POLICY_CONTENT_EN: PolicyContent = {
    title: 'Privacy Policy',
    subtitle: 'DoU Privacy Policy',
    currentVersion: 'v1.0',
    versions: [
        {
            version: 'v1.0',
            effectiveDate: 'March 5, 2025',
            sections: [
                {
                    title: 'Overview',
                    content:
                        'This Service places the highest priority on user privacy and does not retain unnecessary personal information for extended periods.',
                },
                {
                    title: '1. Items Collected and Purpose of Use',
                    content:
                        'The Company collects only the minimum information necessary to provide the Service.\n\n• Email Address\n  - Purpose of collection and use: Identity verification for chat backup/recovery\n  - Retention and usage period: Immediately destroyed upon membership withdrawal\n\n• Device Information and Logs\n  - Purpose of collection and use: App crash tracking, service optimization\n  - Retention and usage period: Immediately destroyed upon membership withdrawal\n  - Information included: Technical data for service stabilization such as device model, OS version, app crash logs, etc.\n\n• Chat Data\n  - Purpose of collection and use: Real-time message delivery and communication\n  - Retention and usage period: Destroyed within 1 day (24 hours) after server storage\n  - Note: Data is transmitted in encrypted form and is permanently and completely deleted from the server after 24 hours of transmission completion.',
                },
                {
                    title: '2. Procedures and Methods of Personal Information Destruction',
                    content:
                        "The principle is to destroy users' personal information without delay once the purpose of collection has been fulfilled.\n\n• Immediate Destruction\nWhen a user chooses to withdraw membership or terminate the service, the collected email and device information are destroyed immediately without any grace period.\n\n• Irrecoverable\nUpon destruction, information in electronic file format is deleted using technical methods that make it impossible to reproduce the records. We inform you that we cannot comply with any investigation cooperation or data recovery requests.",
                },
                {
                    title: '3. Chat Backup Data Management',
                    content:
                        "Chat data that users receive through the 'Email Backup' feature is stored in the user's personal domain (email server and local device).\n\nThe Company has no access to backup files after they have been sent via email, and the user is solely responsible for the loss or leakage of such files.",
                },
                {
                    title: '4. Use of App Crash Analysis Tools',
                    content:
                        'The Service may utilize external analysis tools to analyze app crashes or errors. The collected information is used solely for statistical purposes to improve service quality and is managed in a state where specific individuals cannot be identified.',
                },
                {
                    title: '5. Personal Information Protection Officer',
                    content:
                        'For inquiries regarding personal information during service use, please contact the following officer.\n\n• Officer: Personal Information Protection Officer\n• Contact: app@example.com',
                },
            ],
        },
    ],
};
