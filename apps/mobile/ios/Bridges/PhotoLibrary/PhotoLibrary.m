#import <React/RCTBridgeModule.h>

/// Exposes the Swift `PhotoLibrary` to React Native. The logic lives in PhotoLibrary.swift and
/// Core/PhotoLibraryCore.swift.
@interface RCT_EXTERN_MODULE(PhotoLibrary, NSObject)

RCT_EXTERN_METHOD(listAlbums:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(listPhotos:(NSDictionary *)request
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(readPhoto:(NSString *)id
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(manageSelection:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
