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
import type { Logger, ObservationData } from '@chatic/logger';
import type { ContactsReadResult, IDeviceService } from './types';

export class DeviceService implements IDeviceService {
    constructor(private readonly logger: Logger) {}

    async openSettings(): Promise<boolean> {
        try {
            await Linking.openSettings();
            return true;
        } catch (error) {
            this.logger.error('DEVICE', 'Failed to open settings', error);
            return false;
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

    async getContacts(): Promise<ContactsReadResult> {
        const isAndroid = Platform.OS === 'android';
        if (isAndroid && !(await this.grantAndroidContacts())) {
            return this.deniedContacts();
        }

        let contacts: Contact[];
        try {
            contacts = await Contacts.getAllWithoutPhotos();
        } catch (error: any) {
            if (!isAndroid && error?.message === 'denied') return this.deniedContacts();
            this.logger.error('DEVICE', 'Failed to get contacts', error);
            throw error;
        }

        this.reportContactShape(contacts);
        return { contacts, permission: 'granted' };
    }

    private async grantAndroidContacts(): Promise<boolean> {
        if (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_CONTACTS)) return true;
        const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CONTACTS);
        return result === PermissionsAndroid.RESULTS.GRANTED;
    }

    private deniedContacts(): ContactsReadResult {
        this.logger.warn('DEVICE', 'Read contacts permission denied');
        return { contacts: [], permission: 'denied' };
    }

    private reportContactShape(contacts: Contact[]): void {
        const named = contacts.filter(
            contact => !!(contact.displayName || contact.givenName || contact.familyName)
        ).length;
        const nameless = contacts.length - named;

        const message = `contacts read — ${named}/${contacts.length} named`;
        const data = {
            observation: 'contacts-shape',
            total: contacts.length,
            named,
            nameless,
        } satisfies ObservationData;
        if (nameless > 0) this.logger.warn('DEVICE', message, data);
        else this.logger.info('DEVICE', message, data);
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
                        reject(new Error(response.errorMessage ?? 'Photo library permission denied'));
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
