import { Linking, PermissionsAndroid, Platform, Share, type ShareAction } from 'react-native';
import {
    type Asset,
    type CameraOptions,
    type ImageLibraryOptions,
    launchCamera,
    launchImageLibrary,
} from 'react-native-image-picker';
import { logger } from './log';
import { type DocumentPickerResponse, pick, types } from '@react-native-documents/picker';
import Contacts, { type Contact } from 'react-native-contacts';

export const deviceService = {
    /**
     * 앱 설정 화면으로 이동
     */
    openSettings: async () => {
        try {
            await Linking.openSettings();
        } catch (error) {
            logger.error('DEVICE', 'Failed to open settings', error);
        }
    },

    /**
     * 공유 시트 열기
     */
    openShareSheet: async (data: { title?: string; message?: string; url?: string }): Promise<ShareAction> => {
        try {
            // url 필드는 ios 전용
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
            logger.error('DEVICE', 'Share error', error);
            throw error;
        }
    },

    /**
     * 문서 선택 시트 열기
     */
    openDocument: async (allowMultiSelection = false): Promise<DocumentPickerResponse[]> => {
        try {
            const results = await pick({
                type: [types.allFiles],
                allowMultiSelection,
            });
            logger.info('DEVICE', 'Document opened:', results);
            return results;
        } catch (error: any) {
            if (error?.code === 'DOCUMENT_PICKER_CANCELED' || error?.code === 'OPERATION_CANCELED') {
                logger.info('DEVICE', 'Document picker cancelled');
                return [];
            }
            logger.error('DEVICE', 'Failed to pick document', error);
            throw error;
        }
    },

    /**
     * 연락처 목록 가져오기
     */
    getContacts: async (): Promise<Contact[]> => {
        if (Platform.OS === 'android') {
            // 1. 먼저 현재 권한 상태 확인
            const hasPermission = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_CONTACTS);

            // 2. 권한 없으면 요청
            if (!hasPermission) {
                const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_CONTACTS);
                if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                    logger.error('DEVICE', 'Read contacts permission denied');
                    return [];
                }
            }
        }

        try {
            return await Contacts.getAll();
        } catch (error: any) {
            logger.error('DEVICE', 'Failed to get contacts', error);
            throw error;
        }
    },

    /**
     * 카메라 실행 (사진 촬영)
     */
    openCamera: async (options?: CameraOptions): Promise<Asset[]> => {
        return new Promise((resolve, reject) => {
            launchCamera(
                {
                    mediaType: 'photo',
                    saveToPhotos: false,
                    ...options,
                },
                response => {
                    if (response.didCancel) {
                        logger.info('DEVICE', 'Camera cancelled');
                        resolve([]);
                    } else if (response.errorCode) {
                        logger.error('DEVICE', 'Camera error', response.errorMessage);
                        reject(new Error(response.errorMessage));
                    } else {
                        resolve(response.assets || []);
                    }
                }
            );
        });
    },

    /**
     * 갤러리(사진 라이브러리) 열기
     */
    openPhotoLibrary: async (options?: ImageLibraryOptions): Promise<Asset[]> => {
        return new Promise((resolve, reject) => {
            launchImageLibrary(
                {
                    mediaType: 'photo',
                    selectionLimit: 1,
                    ...options,
                },
                response => {
                    if (response.didCancel) {
                        logger.info('DEVICE', 'Photo library cancelled');
                        resolve([]);
                    } else if (response.errorCode === 'permission') {
                        logger.error('DEVICE', 'Photo library permission denied');
                        resolve([]);
                    } else if (response.errorCode) {
                        logger.error('DEVICE', 'Photo library error', response.errorMessage);
                        reject(new Error(response.errorMessage));
                    } else {
                        resolve(response.assets || []);
                    }
                }
            );
        });
    },
};
