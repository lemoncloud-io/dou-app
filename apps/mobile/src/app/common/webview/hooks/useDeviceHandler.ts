import { useCallback } from 'react';
import { Linking } from 'react-native';
import RNFS from 'react-native-fs';

import { DeviceService } from '../../services';
import { Logger } from '../../services';

import type { WebViewBridge } from './useBaseBridge';
import type {
    AppMessageData,
    OpenCamera,
    OpenPhotoLibrary,
    OpenShareSheet,
    OpenDocument,
    OpenURL,
} from '@chatic/app-messages';
import type { Asset, CameraOptions, ImageLibraryOptions } from 'react-native-image-picker';

export const useDeviceHandler = (bridge: WebViewBridge) => {
    const handleOpenSettings = useCallback(async () => {
        await DeviceService.openSettings();
    }, []);

    const handleOpenShareSheet = useCallback(
        async (data: OpenShareSheet['data']) => {
            try {
                const result = await DeviceService.openShareSheet(data);
                const response: AppMessageData<'OnOpenShareSheet'> = {
                    type: 'OnOpenShareSheet',
                    data: {
                        action: result.action,
                        activityType: result.activityType ?? null,
                    },
                };
                bridge.post(response);
            } catch (e: any) {
                Logger.error('DEVICE', 'OpenShareSheet error', e);
            }
        },
        [bridge]
    );

    const handleOpenDocument: (data: OpenDocument['data']) => Promise<void> = useCallback(
        async (data: OpenDocument['data']) => {
            try {
                const results = await DeviceService.openDocument(data.allowMultiSelection);

                const documents = await Promise.all(
                    results.map(async doc => {
                        let base64: string | undefined;
                        if (data.includeBase64 && doc.uri) {
                            try {
                                base64 = await RNFS.readFile(doc.uri, 'base64');
                            } catch (readError) {
                                Logger.warn('DEVICE', `Failed to read document base64: ${doc.name}`, readError);
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
                    data: {
                        documents,
                    },
                };
                bridge.post(response);
            } catch (e) {
                Logger.error('DEVICE', 'OpenDocument error', e);
            }
        },
        [bridge]
    );

    const handleOpenCamera: (data: OpenCamera['data']) => Promise<void> = useCallback(
        async (data: OpenCamera['data']) => {
            try {
                const assets: Asset[] = await DeviceService.openCamera(data as CameraOptions);
                const response: AppMessageData<'OnOpenCamera'> = {
                    type: 'OnOpenCamera',
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
                Logger.error('DEVICE', 'OpenCamera error', e);
            }
        },
        [bridge]
    );

    const handleOpenPhotoLibrary: (data: OpenPhotoLibrary['data']) => Promise<void> = useCallback(
        async (data: OpenPhotoLibrary['data']) => {
            try {
                const assets: Asset[] = await DeviceService.openPhotoLibrary(data as ImageLibraryOptions);
                const response: AppMessageData<'OnOpenPhotoLibrary'> = {
                    type: 'OnOpenPhotoLibrary',
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
                Logger.error('DEVICE', 'OpenPhotoLibrary error', e);
            }
        },
        [bridge]
    );

    const handleGetContacts: () => Promise<void> = useCallback(async () => {
        try {
            const contacts = await DeviceService.getContacts();
            const response: AppMessageData<'OnGetContacts'> = {
                type: 'OnGetContacts',
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
            Logger.error('DEVICE', 'PickContact error', e);
        }
    }, [bridge]);

    const handleOpenURL = useCallback(async (data: OpenURL['data']) => {
        try {
            await Linking.openURL(data.url);
        } catch (e) {
            Logger.error('DEVICE', 'OpenURL error', e);
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
