#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

/// UploadManager Swift 구현체를 React Native에 노출하는 Objective-C 브릿지.
/// 실제 로직은 UploadManager.swift에 있음.
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

/// RCTEventEmitter 필수 no-op
RCT_EXTERN_METHOD(addListener:(NSString *)eventName)
RCT_EXTERN_METHOD(removeListeners:(NSInteger)count)

@end
