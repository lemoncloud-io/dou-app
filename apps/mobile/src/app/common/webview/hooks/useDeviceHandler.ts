import { useCallback } from 'react';
import { Linking } from 'react-native';
import RNFS from 'react-native-fs';

import { deviceService } from '../../services';
import { logger } from '../../services';

import type { WebViewBridge } from './useBaseBridge';
import type {
    AppMessageData,
    OpenCamera,
    OpenPhotoLibrary,
    OpenShareSheet,
    OpenDocument,
    GetContacts,
    OpenURL,
} from '@chatic/app-messages';
import type { Asset, CameraOptions, ImageLibraryOptions } from 'react-native-image-picker';

export const useDeviceHandler = (bridge: WebViewBridge) => {
    const handleOpenSettings = useCallback(async () => {
        await deviceService.openSettings();
    }, []);

    const handleOpenShareSheet = useCallback(
        async (message: OpenShareSheet) => {
            try {
                const result = await deviceService.openShareSheet(message.data);
                const response: AppMessageData<'OnOpenShareSheet'> = {
                    type: 'OnOpenShareSheet',
                    nonce: message.nonce,
                    data: {
                        action: result.action,
                        activityType: result.activityType ?? null,
                    },
                };
                bridge.post(response);
            } catch (e: any) {
                logger.error('DEVICE', 'OpenShareSheet error', e);
            }
        },
        [bridge]
    );

    const handleOpenDocument = useCallback(
        async (message: OpenDocument) => {
            try {
                const results = await deviceService.openDocument(message.data.allowMultiSelection);

                const documents = await Promise.all(
                    results.map(async doc => {
                        let base64: string | undefined;
                        if (message.data.includeBase64 && doc.uri) {
                            try {
                                base64 = await RNFS.readFile(doc.uri, 'base64');
                            } catch (readError) {
                                logger.warn('DEVICE', `Failed to read document base64: ${doc.name}`, readError);
                            }
                        }
                        return {
                            uri: doc.uri,
                            name: doc.name,
                            type: doc.type,
                            size: doc.size,
                            base64,
                        };
                    })
                );

                const response: AppMessageData<'OnOpenDocument'> = {
                    type: 'OnOpenDocument',
                    nonce: message.nonce,
                    data: {
                        documents,
                    },
                };
                bridge.post(response);
            } catch (e) {
                logger.error('DEVICE', 'OpenDocument error', e);
            }
        },
        [bridge]
    );

    const handleOpenCamera = useCallback(
        async (message: OpenCamera) => {
            try {
                const assets: Asset[] = await deviceService.openCamera(message.data as CameraOptions);
                const response: AppMessageData<'OnOpenCamera'> = {
                    type: 'OnOpenCamera',
                    nonce: message.nonce,
                    data: {
                        assets: assets.map(asset => ({
                            uri: asset.uri,
                            fileSize: asset.fileSize,
                            width: asset.width,
                            height: asset.height,
                            fileName: asset.fileName,
                            type: asset.type,
                            base64: asset.base64,
                        })),
                    },
                };
                bridge.post(response);
            } catch (e) {
                logger.error('DEVICE', 'OpenCamera error', e);
            }
        },
        [bridge]
    );

    const handleOpenPhotoLibrary = useCallback(
        async (message: OpenPhotoLibrary) => {
            try {
                const assets: Asset[] = await deviceService.openPhotoLibrary(message.data as ImageLibraryOptions);
                const response: AppMessageData<'OnOpenPhotoLibrary'> = {
                    type: 'OnOpenPhotoLibrary',
                    nonce: message.nonce,
                    data: {
                        assets: assets.map(asset => ({
                            uri: asset.uri,
                            fileSize: asset.fileSize,
                            width: asset.width,
                            height: asset.height,
                            fileName: asset.fileName,
                            type: asset.type,
                            base64: asset.base64,
                        })),
                    },
                };
                bridge.post(response);
            } catch (e) {
                logger.error('DEVICE', 'OpenPhotoLibrary error', e);
            }
        },
        [bridge]
    );

    const handleGetContacts = useCallback(
        async (message: GetContacts) => {
            try {
                const contacts = await deviceService.getContacts();
                const response: AppMessageData<'OnGetContacts'> = {
                    type: 'OnGetContacts',
                    nonce: message.nonce,
                    data: {
                        contacts: contacts.map(contact => ({
                            recordID: contact.recordID,
                            backTitle: contact.backTitle || '',
                            company: contact.company || '',
                            emailAddresses: contact.emailAddresses,
                            displayName: contact.displayName || '',
                            familyName: contact.familyName,
                            givenName: contact.givenName || '',
                            middleName: contact.middleName || '',
                            jobTitle: contact.jobTitle || '',
                            phoneNumbers: contact.phoneNumbers,
                            hasThumbnail: contact.hasThumbnail,
                            thumbnailPath: contact.thumbnailPath || '',
                            isStarred: contact.isStarred,
                            postalAddresses: contact.postalAddresses,
                            prefix: contact.prefix || '',
                            suffix: contact.suffix || '',
                            department: contact.department || '',
                            birthday: (contact.birthday || undefined) as any,
                            imAddresses: contact.imAddresses,
                            urlAddresses: contact.urlAddresses,
                            note: contact.note || '',
                        })),
                    },
                };
                bridge.post(response);
            } catch (e) {
                logger.error('DEVICE', 'GetContacts error', e);
                // 에러 시에도 빈 배열로 응답 전송 (Web이 무한 대기하지 않도록)
                const response: AppMessageData<'OnGetContacts'> = {
                    type: 'OnGetContacts',
                    nonce: message.nonce,
                    data: { contacts: [] },
                };
                bridge.post(response);
            }
        },
        [bridge]
    );

    const handleOpenURL = useCallback(async (message: OpenURL) => {
        try {
            const { url } = message.data;
            await Linking.openURL(url);
        } catch (e) {
            logger.error('DEVICE', 'OpenURL error', e);
        }
    }, []);

    return {
        handleOpenSettings,
        handleOpenShareSheet,
        handleOpenDocument,
        handleOpenCamera,
        handleOpenPhotoLibrary,
        handleGetContacts,
        handleOpenURL,
    };
};
