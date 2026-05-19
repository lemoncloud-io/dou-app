import { useCallback } from 'react';
import { Linking } from 'react-native';
import RNFS from 'react-native-fs';
import { useServices } from '../../hooks';
import type {
    GetContacts,
    OnGetContacts,
    OnOpenCamera,
    OnOpenDocumentPayload,
    OnOpenPhotoLibrary,
    OnOpenShareSheet,
    OpenCamera,
    OpenDocument,
    OpenPhotoLibrary,
    OpenSettings,
    OpenShareSheet,
    OpenURL,
} from '@chatic/app-messages';
import type { Asset } from 'react-native-image-picker';

export const useDeviceHandler = () => {
    const { deviceService, logService: logger } = useServices();

    const handleOpenSettings = useCallback(
        async (_message: OpenSettings) => {
            await deviceService.openSettings();
        },
        [deviceService]
    );

    const handleOpenShareSheet = useCallback(
        async (message: OpenShareSheet): Promise<{ data: OnOpenShareSheet['data'] }> => {
            const data = message.data;
            try {
                const result = await deviceService.openShareSheet(data);
                return {
                    data: {
                        action: result.action,
                        activityType: result.activityType ?? null,
                    },
                };
            } catch (e: any) {
                logger.error('DEVICE', 'OpenShareSheet error', e);
                throw e;
            }
        },
        [deviceService, logger]
    );

    const handleOpenDocument = useCallback(
        async (message: OpenDocument): Promise<{ data: OnOpenDocumentPayload }> => {
            const data = message.data;
            try {
                const results = await deviceService.openDocument(data.allowMultiSelection);

                const documents = await Promise.all(
                    results.map(async doc => {
                        let base64: string | undefined;
                        if (data.includeBase64 && doc.uri) {
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
                return {
                    data: {
                        documents: documents,
                    },
                };
            } catch (e) {
                logger.error('DEVICE', 'OpenDocument error', e);
                throw e;
            }
        },
        [deviceService, logger]
    );

    const handleOpenCamera = useCallback(
        async (_message: OpenCamera): Promise<{ data: OnOpenCamera['data'] }> => {
            try {
                const assets: Asset[] = await deviceService.openCamera();
                return {
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
            } catch (e) {
                logger.error('DEVICE', 'OpenCamera error', e);
                throw e;
            }
        },
        [deviceService, logger]
    );

    const handleOpenPhotoLibrary = useCallback(
        async (_message: OpenPhotoLibrary): Promise<{ data: OnOpenPhotoLibrary['data'] }> => {
            try {
                const assets: Asset[] = await deviceService.openPhotoLibrary();
                return {
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
            } catch (e) {
                logger.error('DEVICE', 'OpenPhotoLibrary error', e);
                throw e;
            }
        },
        [deviceService, logger]
    );

    const handleGetContacts = useCallback(
        async (_message: GetContacts): Promise<{ data: OnGetContacts['data'] }> => {
            try {
                const contacts = await deviceService.getContacts();
                return {
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
            } catch (e) {
                logger.error('DEVICE', 'GetContacts error', e);
                return { data: { contacts: [] } };
            }
        },
        [deviceService, logger]
    );

    const handleOpenURL = useCallback(
        async (_message: OpenURL): Promise<void> => {
            const { url } = _message.data;
            try {
                await Linking.openURL(url);
            } catch (e) {
                logger.error('DEVICE', 'OpenURL error', e);
                throw e;
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
    };
};
