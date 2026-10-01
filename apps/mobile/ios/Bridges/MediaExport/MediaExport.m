#import <React/RCTBridgeModule.h>

/// Exposes the Swift `MediaExport` to React Native. The logic lives in MediaExport.swift.
@interface RCT_EXTERN_MODULE(MediaExport, NSObject)

RCT_EXTERN_METHOD(saveToPhotoLibrary:(NSString *)uri
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(shareFile:(NSString *)uri
                  title:(NSString *)title
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
