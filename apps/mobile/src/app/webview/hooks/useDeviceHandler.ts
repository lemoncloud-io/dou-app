import { useCallback } from 'react';
import { Linking } from 'react-native';
import RNFS from 'react-native-fs';
import { useServices } from '../../hooks';
import type {
    GetContacts,
    OpenCamera,
    OpenDocument,
    OpenPhotoLibrary,
    OpenShareSheet,
    OpenURL,
    OnGetContacts,
    OnOpenCamera,
    OnOpenDocument,
    OnOpenPhotoLibrary,
    OnOpenShareSheet,
} from '@chatic/app-messages';
import type { Asset, CameraOptions, ImageLibraryOptions } from 'react-native-image-picker';

export const useDeviceHandler = () => {
    const { deviceService, logService: logger } = useServices();
    const handleOpenSettings = useCallback(async () => {
        await deviceService.openSettings();
    }, [deviceService]);

    const handleOpenShareSheet = useCallback(
        async (payload: OpenShareSheet['data']): Promise<OnOpenShareSheet['data']> => {
            try {
                const result = await deviceService.openShareSheet(payload);
                return {
                    action: result.action,
                    activityType: result.activityType ?? null,
                };
            } catch (e: any) {
                logger.error('DEVICE', 'OpenShareSheet error', e);
                throw e;
            }
        },
        [deviceService, logger]
    );

    const handleOpenDocument = useCallback(
        async (payload: OpenDocument['data']): Promise<OnOpenDocument['data']> => {
            try {
                const results = await deviceService.openDocument(payload.allowMultiSelection);

                const documents = await Promise.all(
                    results.map(async doc => {
                        let base64: string | undefined;
                        if (payload.includeBase64 && doc.uri) {
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
                return { documents };
            } catch (e) {
                logger.error('DEVICE', 'OpenDocument error', e);
                throw e;
            }
        },
        [deviceService, logger]
    );

    const handleOpenCamera = useCallback(
        async (payload: OpenCamera['data']): Promise<OnOpenCamera['data']> => {
            try {
                const assets: Asset[] = await deviceService.openCamera(payload as CameraOptions);
                return {
                    assets: assets.map(asset => ({
                        uri: asset.uri,
                        fileSize: asset.fileSize,
                        width: asset.width,
                        height: asset.height,
                        fileName: asset.fileName,
                        type: asset.type,
                        base64: asset.base64,
                    })),
                };
            } catch (e) {
                logger.error('DEVICE', 'OpenCamera error', e);
                throw e;
            }
        },
        [deviceService, logger]
    );

    const handleOpenPhotoLibrary = useCallback(
        async (payload: OpenPhotoLibrary['data']): Promise<OnOpenPhotoLibrary['data']> => {
            try {
                const assets: Asset[] = await deviceService.openPhotoLibrary(payload as ImageLibraryOptions);
                return {
                    assets: assets.map(asset => ({
                        uri: asset.uri,
                        fileSize: asset.fileSize,
                        width: asset.width,
                        height: asset.height,
                        fileName: asset.fileName,
                        type: asset.type,
                        base64: asset.base64,
                    })),
                };
            } catch (e) {
                logger.error('DEVICE', 'OpenPhotoLibrary error', e);
                throw e;
            }
        },
        [deviceService, logger]
    );

    const handleGetContacts = useCallback(
        async (_payload: GetContacts): Promise<OnGetContacts['data']> => {
            try {
                const contacts = await deviceService.getContacts();
                return {
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
                };
            } catch (e) {
                logger.error('DEVICE', 'GetContacts error', e);
                // 에러 시에도 빈 배열로 응답 전송 (Web이 무한 대기하지 않도록)
                return { contacts: [] };
            }
        },
        [deviceService, logger]
    );

    const handleOpenURL = useCallback(
        async (payload: OpenURL['data']): Promise<void> => {
            try {
                const { url } = payload;
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
