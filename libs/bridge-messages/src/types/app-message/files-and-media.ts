import type {
    OnAckFileTransfersPayload,
    OnAudioRecordingEndedPayload,
    OnAudioRecordingStartedPayload,
    OnCancelFileTransferPayload,
    OnFetchShareIntakePayload,
    OnFileTransferStatePayload,
    OnKeepLibraryVideoPayload,
    OnListFileTransfersPayload,
    OnListPhotoAlbumsPayload,
    OnListPhotosPayload,
    OnManagePhotoSelectionPayload,
    OnOpenFilePayload,
    OnPickAttachmentsPayload,
    OnPrepareVideoPayload,
    OnReadAttachmentPayload,
    OnReadPhotoPayload,
    OnReadVideoFramePayload,
    OnReleaseShareIntakePayload,
    OnSaveFilePayload,
    OnSaveToPhotoLibraryPayload,
    OnShareFilePayload,
    OnStartFileTransferPayload,
    OnWriteTempFilePayload,
} from '../model';

export type FilesAndMediaAppMessageDataMap = {
    OnFileTransferState: OnFileTransferStatePayload;
    OnStartFileTransfer: OnStartFileTransferPayload;
    OnCancelFileTransfer: OnCancelFileTransferPayload;
    OnListFileTransfers: OnListFileTransfersPayload;
    OnAckFileTransfers: OnAckFileTransfersPayload;
    OnWriteTempFile: OnWriteTempFilePayload;
    OnListPhotoAlbums: OnListPhotoAlbumsPayload;
    OnListPhotos: OnListPhotosPayload;
    OnReadPhoto: OnReadPhotoPayload;
    OnKeepLibraryVideo: OnKeepLibraryVideoPayload;
    OnManagePhotoSelection: OnManagePhotoSelectionPayload;
    OnSaveToPhotoLibrary: OnSaveToPhotoLibraryPayload;
    OnShareFile: OnShareFilePayload;
    OnOpenFile: OnOpenFilePayload;
    OnSaveFile: OnSaveFilePayload;
    OnPickAttachments: OnPickAttachmentsPayload;
    OnPrepareVideo: OnPrepareVideoPayload;
    OnReadAttachment: OnReadAttachmentPayload;
    OnReadVideoFrame: OnReadVideoFramePayload;
    OnAudioRecordingStarted: OnAudioRecordingStartedPayload;
    OnAudioRecordingEnded: OnAudioRecordingEndedPayload;
    OnFetchShareIntake: OnFetchShareIntakePayload;
    OnReleaseShareIntake: OnReleaseShareIntakePayload;
};
