#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

/// Exposes the Swift `AudioRecorder` to React Native. The logic lives in AudioRecorder.swift and
/// Core/AudioRecorderCore.swift.
@interface RCT_EXTERN_MODULE(AudioRecorder, RCTEventEmitter)

RCT_EXTERN_METHOD(start:(NSNumber *)maxDurationMs
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stop:(NSString *)action
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
