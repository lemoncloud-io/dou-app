import { Linking, PermissionsAndroid, Platform, Share, type ShareAction } from 'react-native';
import {
    type Asset,
    type CameraOptions,
    type ImageLibraryOptions,
    launchCamera,
    launchImageLibrary,
} from 'react-native-image-picker';
import { type DocumentPickerResponse, pick, types } from '@react-native-documents/picker';
import Contacts, { type Contact } from 'react-native-contacts';
import type { ILogService } from '../log';
import type { IDeviceService } from './types';

export class DeviceService implements IDeviceService {
    constructor(private readonly logger: ILogService) {}

    async openSettings(): Promise<void> {
        try {
            await Linking.openSettings();
        } catch (error) {
            this.logger.error('DEVICE', 'Failed to open settings', error);
        }
    }

    async openShareSheet(data: { title?: string; message?: string; url?: string }): Promise<ShareAction> {
        try {
            const message =
                Platform.OS === 'android' && data.url
                    ? `${data.message ?? ''} ${data.url}`.trim()
                    : (data.message ?? '');

            return await Share.share({
                title: data.title,
                message,
                url: data.url,
            });
        } catch (error: any) {
            this.logger.error('DEVICE', 'Share error', error);
            throw error;
        }
    }

    async openDocument(allowMultiSelection = false): Promise<DocumentPickerResponse[]> {
        try {
            const results = await pick({
                type: [types.allFiles],
                allowMultiSelection,
            });
            this.logger.info('DEVICE', 'Document opened:', results);
            return results;
        } catch (error: any) {
            if (error?.code === 'DOCUMENT_PICKER_CANCELED' || error?.code === 'OPERATION_CANCELED') {
                this.logger.info('DEVICE', 'Document picker cancelled');
                return [];
            }
            this.logger.error('DEVICE', 'Failed to pick document', error);
            throw error;
        }
    }

    async getContacts(): Promise<Contact[]> {
        if (Platform.OS === 'android') {
            const hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_CONTACTS);

            if (!hasPermission) {
                const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CONTACTS);
                if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                    this.logger.error('DEVICE', 'Read contacts permission denied');
                    return [];
                }
            }
        }

        try {
            return await Contacts.getAll();
        } catch (error: any) {
            this.logger.error('DEVICE', 'Failed to get contacts', error);
            throw error;
        }
    }

    async openCamera(options?: CameraOptions): Promise<Asset[]> {
        return new Promise((resolve, reject) => {
            launchCamera(
                {
                    mediaType: 'photo',
                    saveToPhotos: false,
                    ...options,
                },
                response => {
                    if (response.didCancel) {
                        this.logger.info('DEVICE', 'Camera cancelled');
                        resolve([]);
                    } else if (response.errorCode) {
                        this.logger.error('DEVICE', 'Camera error', response.errorMessage);
                        reject(new Error(response.errorMessage));
                    } else {
                        resolve(response.assets || []);
                    }
                }
            );
        });
    }

    async openPhotoLibrary(options?: ImageLibraryOptions): Promise<Asset[]> {
        return new Promise((resolve, reject) => {
            launchImageLibrary(
                {
                    mediaType: 'photo',
                    selectionLimit: 1,
                    ...options,
                },
                response => {
                    if (response.didCancel) {
                        this.logger.info('DEVICE', 'Photo library cancelled');
                        resolve([]);
                    } else if (response.errorCode === 'permission') {
                        this.logger.error('DEVICE', 'Photo library permission denied');
                        resolve([]);
                    } else if (response.errorCode) {
                        this.logger.error('DEVICE', 'Photo library error', response.errorMessage);
                        reject(new Error(response.errorMessage));
                    } else {
                        resolve(response.assets || []);
                    }
                }
            );
        });
    }
}
