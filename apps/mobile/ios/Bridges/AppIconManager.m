#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

@interface AppIconManager : NSObject <RCTBridgeModule>
@end

@implementation AppIconManager

RCT_EXPORT_MODULE();

- (dispatch_queue_t)methodQueue {
    return dispatch_get_main_queue();
}

RCT_EXPORT_METHOD(changeIcon:(NSString *)iconName
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    
    if (@available(iOS 10.3, *)) {
        if ([[UIApplication sharedApplication] supportsAlternateIcons]) {
            NSString *targetIcon = ([iconName isEqualToString:@"DefaultIcon"]) ? nil : iconName;
            
            [[UIApplication sharedApplication] setAlternateIconName:targetIcon completionHandler:^(NSError * _Nullable error) {
                if (error) {
                    reject(@"ICON_CHANGE_FAILED", error.localizedDescription, error);
                } else {
                    resolve(@(YES));
                }
            }];
        } else {
            reject(@"UNSUPPORTED", @"This device does not support alternate icons.", nil);
        }
    } else {
        reject(@"UNSUPPORTED", @"Only supported on iOS 10.3 and above.", nil);
    }
}

@end
