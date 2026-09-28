import { type ShareAction } from 'react-native';
import { type Asset, type CameraOptions, type ImageLibraryOptions } from 'react-native-image-picker';
import { type DocumentPickerResponse } from '@react-native-documents/picker';
import { type Contact } from 'react-native-contacts';
import { type ContactsPermission } from '@chatic/app-messages';

export interface ContactsReadResult {
    contacts: Contact[];
    permission: ContactsPermission;
}

export interface IDeviceService {
    openSettings(): Promise<void>;
    openShareSheet(data: { title?: string; message?: string; url?: string }): Promise<ShareAction>;
    openDocument(allowMultiSelection?: boolean): Promise<DocumentPickerResponse[]>;
    getContacts(): Promise<ContactsReadResult>;
    openCamera(options?: CameraOptions): Promise<Asset[]>;
    openPhotoLibrary(options?: ImageLibraryOptions): Promise<Asset[]>;
}
