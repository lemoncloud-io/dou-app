import { useCallback } from 'react';
import { Linking } from 'react-native';
import { FileManagerBridge } from '../../bridge';
import { useServices } from '../../hooks';
import type { WebMessageAppHandler } from '@chatic/app-messages';
import type { Asset } from 'react-native-image-picker';

export const useDeviceHandler = () => {
    const { deviceService, logService: logger } = useServices();

    const handleOpenSettings = useCallback<WebMessageAppHandler<'OpenSettings'>>(
        async _message => {
            await deviceService.openSettings();
            return { type: 'OnOpenSettings' as const, success: true, data: {} };
        },
        [deviceService]
    );

    const handleOpenShareSheet = useCallback<WebMessageAppHandler<'OpenShareSheet'>>(
        async message => {
            const data = message.data;
            try {
                const result = await deviceService.openShareSheet(data);
                return {
                    type: 'OnOpenShareSheet' as const,
                    success: true,
                    data: { action: result.action, activityType: result.activityType ?? null },
                };
            } catch (e: any) {
                logger.error('DEVICE', 'OpenShareSheet error', e);
                return {
                    type: 'OnOpenShareSheet' as const,
                    success: false,
                    error: { code: 'SHARE_ERROR', message: e.message },
                };
            }
        },
        [deviceService, logger]
    );

    const handleOpenDocument = useCallback<WebMessageAppHandler<'OpenDocument'>>(
        async message => {
            const data = message.data;
            try {
                const results = await deviceService.openDocument(data.allowMultiSelection);

                const documents = await Promise.all(
                    results.map(async doc => {
                        let base64: string | undefined;
                        if (data.includeBase64 && doc.uri) {
                            try {
                                base64 = await FileManagerBridge.readFile(doc.uri);
                            } catch (readError) {
                                logger.warn('DEVICE', `Failed to read document base64: ${doc.name}`, readError);
                            }
                        }
                        return { uri: doc.uri, name: doc.name, type: doc.type, size: doc.size, base64 };
                    })
                );
                return { type: 'OnOpenDocument' as const, success: true, data: { documents } };
            } catch (e: any) {
                logger.error('DEVICE', 'OpenDocument error', e);
                return {
                    type: 'OnOpenDocument' as const,
                    success: false,
                    error: { code: 'DOC_ERROR', message: e.message },
                };
            }
        },
        [deviceService, logger]
    );

    const handleOpenCamera = useCallback<WebMessageAppHandler<'OpenCamera'>>(
        async _message => {
            try {
                const assets: Asset[] = await deviceService.openCamera();
                return {
                    type: 'OnOpenCamera' as const,
                    success: true,
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
            } catch (e: any) {
                logger.error('DEVICE', 'OpenCamera error', e);
                return {
                    type: 'OnOpenCamera' as const,
                    success: false,
                    error: { code: 'CAMERA_ERROR', message: e.message },
                };
            }
        },
        [deviceService, logger]
    );

    const handleOpenPhotoLibrary = useCallback<WebMessageAppHandler<'OpenPhotoLibrary'>>(
        async _message => {
            try {
                const assets: Asset[] = await deviceService.openPhotoLibrary();
                return {
                    type: 'OnOpenPhotoLibrary' as const,
                    success: true,
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
            } catch (e: any) {
                logger.error('DEVICE', 'OpenPhotoLibrary error', e);
                return {
                    type: 'OnOpenPhotoLibrary' as const,
                    success: false,
                    error: { code: 'LIBRARY_ERROR', message: e.message },
                };
            }
        },
        [deviceService, logger]
    );

    const handleGetContacts = useCallback<WebMessageAppHandler<'GetContacts'>>(
        async _message => {
            try {
                const contacts = await deviceService.getContacts();
                return {
                    type: 'OnGetContacts' as const,
                    success: true,
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
            } catch (e: any) {
                logger.error('DEVICE', 'GetContacts error', e);
                return {
                    type: 'OnGetContacts' as const,
                    success: false,
                    error: { code: 'CONTACT_ERROR', message: e.message },
                };
            }
        },
        [deviceService, logger]
    );

    const handleOpenURL = useCallback<WebMessageAppHandler<'OpenURL'>>(
        async message => {
            const { url } = message.data;
            try {
                await Linking.openURL(url);
                return { type: 'OnOpenURL' as const, success: true, data: {} };
            } catch (e: any) {
                logger.error('DEVICE', 'OpenURL error', e);
                return {
                    type: 'OnOpenURL' as const,
                    success: false,
                    error: { code: 'LINK_ERROR', message: e.message },
                };
            }
        },
        [logger]
    );

    const handleCreateDummyFile = useCallback<WebMessageAppHandler<'CreateDummyFile'>>(
        async message => {
            const { sizeInBytes, fileName } = message.data;
            const path = `${FileManagerBridge.DocumentDirectoryPath}/${fileName}`;
            try {
                const resultPath = await FileManagerBridge.createDummyFile(path, sizeInBytes);
                return {
                    type: 'OnCreateDummyFile' as const,
                    success: true,
                    data: {
                        uri: `file://${resultPath}`,
                        name: fileName,
                        size: sizeInBytes,
                    },
                };
            } catch (e: any) {
                logger.error('DEVICE', 'CreateDummyFile error', e);
                return {
                    type: 'OnCreateDummyFile' as const,
                    success: false,
                    error: { code: 'DUMMY_FILE_ERROR', message: e.message },
                };
            }
        },
        [logger]
    );

    return {
        handleOpenSettings,
        handleOpenShareSheet,
        handleOpenDocument,
        handleOpenCamera,
        handleOpenPhotoLibrary,
        handleGetContacts,
        handleOpenURL,
        handleCreateDummyFile,
    };
};
