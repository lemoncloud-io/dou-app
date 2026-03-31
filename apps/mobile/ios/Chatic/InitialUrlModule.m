#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(InitialUrlModule, NSObject)

RCT_EXTERN_METHOD(getInitialUniversalLink:
                  (RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
