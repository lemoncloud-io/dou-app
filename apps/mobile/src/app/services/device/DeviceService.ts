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
import type { ObservationData } from '@chatic/logger';
import type { ILogService } from '../log';
import type { ContactsReadResult, IDeviceService } from './types';

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

    /**
     * Reads the address book and says whether it was denied, so the web can tell a denial from an
     * empty address book — on the wire the two used to look the same.
     *
     * On iOS the fetch itself raises the system prompt, and `Contacts.checkPermission()` is never
     * called. In react-native-contacts 8.0.10 its new-architecture implementation never settles on
     * iOS 18+ while the status is not-yet-determined or limited: the iOS 18 branch compares against
     * `Restricted` (already handled above it) instead of `Limited`, so neither case resolves. Called
     * before the fetch it hung the request before any prompt appeared; called after a fetch that
     * followed partial access it never returned. A refusal is read from the fetch's own rejection
     * instead — the library rejects with the message `denied` exactly when the status is denied or
     * restricted.
     *
     * Partial access is therefore reported as `granted`: the list is real, only shorter, and telling
     * the two apart would need that same broken call.
     */
    async getContacts(): Promise<ContactsReadResult> {
        const isAndroid = Platform.OS === 'android';
        if (isAndroid && !(await this.grantAndroidContacts())) {
            return this.deniedContacts();
        }

        let contacts: Contact[];
        try {
            // Without photos: `getAll` makes iOS write a PNG into Caches for every contact that has
            // one, and the web cannot show those paths anyway — it only reads names, company, job
            // title and numbers.
            contacts = await Contacts.getAllWithoutPhotos();
        } catch (error: any) {
            // A refusal at the prompt the fetch raised arrives as a rejection, not as a status.
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
        // The user's choice, not a fault — the catalog puts permission denial at `warn` so `error`
        // stays a signal that something broke.
        this.logger.warn('DEVICE', 'Read contacts permission denied');
        return { contacts: [], permission: 'denied' };
    }

    /**
     * Records how many of the fetched contacts have a usable name.
     *
     * "Some contacts show up with no name" is a successful read, not a failure — nothing throws, so
     * no failure trigger can see it. What separates the possible causes is the SHAPE: none named
     * points at permissions or the account the contacts live in, some named points at that device's
     * contact data (ADR-0099).
     *
     * Counts only. Names and numbers are content, and the diagnosis does not need them.
     */
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
