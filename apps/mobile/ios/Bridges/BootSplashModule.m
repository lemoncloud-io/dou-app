#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(BootSplash, NSObject)

RCT_EXTERN_METHOD(hide:(BOOL)fade
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setStartupTheme:(NSString *)theme
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
