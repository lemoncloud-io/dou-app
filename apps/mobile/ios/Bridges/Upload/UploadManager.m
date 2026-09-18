#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

/// Objective-C bridge that exposes the UploadManager Swift implementation to React Native.
/// The actual logic lives in UploadManager.swift.
@interface RCT_EXTERN_MODULE(UploadManager, RCTEventEmitter)

RCT_EXTERN_METHOD(enqueueUpload:(NSDictionary *)payload
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(pauseUpload:(NSString *)uploadId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(resumeUpload:(NSString *)uploadId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(cancelUpload:(NSString *)uploadId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

/// Required no-op for RCTEventEmitter
RCT_EXTERN_METHOD(addListener:(NSString *)eventName)
RCT_EXTERN_METHOD(removeListeners:(NSInteger)count)

@end
