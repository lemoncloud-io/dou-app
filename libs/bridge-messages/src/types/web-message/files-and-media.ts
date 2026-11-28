import type {
    AckFileTransfersPayload,
    CancelFileTransferPayload,
    FetchShareIntakePayload,
    KeepLibraryVideoPayload,
    ListFileTransfersPayload,
    ListPhotoAlbumsPayload,
    ListPhotosPayload,
    ManagePhotoSelectionPayload,
    OpenFilePayload,
    PickAttachmentsPayload,
    PrepareVideoPayload,
    ReadAttachmentPayload,
    ReadPhotoPayload,
    ReadVideoFramePayload,
    ReleaseShareIntakePayload,
    SaveFilePayload,
    SaveToPhotoLibraryPayload,
    ShareFilePayload,
    StartAudioRecordingPayload,
    StartFileTransferPayload,
    StopAudioRecordingPayload,
    WriteTempFilePayload,
} from '../model';

export type FilesAndMediaWebMessagePayloadMap = {
    StartFileTransfer: StartFileTransferPayload;
    CancelFileTransfer: CancelFileTransferPayload;
    ListFileTransfers: ListFileTransfersPayload;
    AckFileTransfers: AckFileTransfersPayload;
    WriteTempFile: WriteTempFilePayload;
    ListPhotoAlbums: ListPhotoAlbumsPayload;
    ListPhotos: ListPhotosPayload;
    ReadPhoto: ReadPhotoPayload;
    ManagePhotoSelection: ManagePhotoSelectionPayload;
    KeepLibraryVideo: KeepLibraryVideoPayload;
    SaveToPhotoLibrary: SaveToPhotoLibraryPayload;
    ShareFile: ShareFilePayload;
    OpenFile: OpenFilePayload;
    SaveFile: SaveFilePayload;
    PickAttachments: PickAttachmentsPayload;
    PrepareVideo: PrepareVideoPayload;
    ReadAttachment: ReadAttachmentPayload;
    ReadVideoFrame: ReadVideoFramePayload;
    StartAudioRecording: StartAudioRecordingPayload;
    StopAudioRecording: StopAudioRecordingPayload;
    FetchShareIntake: FetchShareIntakePayload;
    ReleaseShareIntake: ReleaseShareIntakePayload;
};
