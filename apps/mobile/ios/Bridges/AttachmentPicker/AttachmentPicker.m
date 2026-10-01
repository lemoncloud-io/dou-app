#import <React/RCTBridgeModule.h>

/// Exposes the Swift `AttachmentPicker` to React Native. The logic lives in AttachmentPicker.swift and
/// Core/AttachmentPickerCore.swift.
@interface RCT_EXTERN_MODULE(AttachmentPicker, NSObject)

RCT_EXTERN_METHOD(pick:(NSString *)source
                  selectionLimit:(nonnull NSNumber *)selectionLimit
                  maxBytes:(NSDictionary *)maxBytes
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(prepareVideo:(NSString *)uri
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(readAttachment:(NSString *)uri
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
