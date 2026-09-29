import { defineDebugStrings } from '../define';

const en = {
    deviceInfoTitle: 'Device Info',
    /** Keys match `DeviceInfoRowLabels` — passed straight into `buildDeviceInfoRows`. */
    rows: {
        deviceId: 'Device ID',
        installId: 'Install ID',
        platform: 'Platform',
        model: 'Model',
        stage: 'Stage',
        application: 'Application',
    },
    actions: {
        title: 'Actions',
        hint: 'The app opens an OS window and returns the result',
        camera: 'Camera',
        photos: 'Photos',
        file: 'File',
        contacts: 'Contacts',
        writeClipboard: 'Write clipboard',
        osSettings: 'OS settings',
        shareSheet: 'Share sheet',
    },
    /** Labels passed to `run`/`fire` — shown as the operation name in the result line. */
    operations: {
        camera: 'Camera',
        photoLibrary: 'Photo library',
        file: 'File',
        contacts: 'Contacts',
        nativeClipboard: 'Native clipboard',
        openOsSettings: 'Open OS settings',
        shareSheet: 'Share sheet',
    },
    permissionsTitle: 'Permissions',
};

const ko: typeof en = {
    deviceInfoTitle: '기기 정보',
    rows: {
        deviceId: '기기 ID',
        installId: '설치 ID',
        platform: '플랫폼',
        model: '모델',
        stage: '스테이지',
        application: '애플리케이션',
    },
    actions: {
        title: '조작',
        hint: '앱이 OS 창을 띄우고 결과를 돌려줍니다',
        camera: '카메라',
        photos: '앨범',
        file: '파일',
        contacts: '연락처',
        writeClipboard: '클립보드 쓰기',
        osSettings: 'OS 설정',
        shareSheet: '공유 시트',
    },
    operations: {
        camera: '카메라',
        photoLibrary: '앨범',
        file: '파일',
        contacts: '연락처',
        nativeClipboard: '네이티브 클립보드',
        openOsSettings: 'OS 설정 열기',
        shareSheet: '공유 시트',
    },
    permissionsTitle: '권한',
};

export const useDeviceInfoScreenStrings = defineDebugStrings({ ko, en });
