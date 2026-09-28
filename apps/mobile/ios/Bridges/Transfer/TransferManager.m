#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

/// Exposes the Swift `TransferManager` to React Native. The logic lives in TransferManager.swift
/// and TransferSessionOwner.swift.
@interface RCT_EXTERN_MODULE(TransferManager, RCTEventEmitter)

RCT_EXTERN_METHOD(start:(NSDictionary *)request
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(cancel:(NSString *)transferId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(list:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(ack:(NSArray *)transferIds
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

@end
