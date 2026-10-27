#import <React/RCTBridgeModule.h>

/// Exposes the Swift `ShareIntake` to React Native. The logic lives in ShareIntake.swift; the share
/// sheet side is the ChaticShareExtension target.
@interface RCT_EXTERN_MODULE(ShareIntake, NSObject)

RCT_EXTERN_METHOD(fetch:(NSString *)id
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(release:(NSString *)id
                  discard:(BOOL)discard
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
