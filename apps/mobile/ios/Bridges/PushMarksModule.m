#import <React/RCTBridgeModule.h>

/**
 * Drains the cross-cloud push marks the Notification Service Extension recorded for a background
 * chat push (ADR-0056) — read and clear the shared App Group store in one call, so a mark reaches
 * the web exactly once. Called on boot (after `WebAppReady`) and on foreground return; see
 * `useFcmHandler`'s `FetchPushMarks` handler on the JS side.
 *
 * App Group id and key must match `NotificationService.swift`'s `appGroupId`/`pushMarksKey`.
 */
@interface PushMarksModule : NSObject <RCTBridgeModule>
@end

@implementation PushMarksModule

RCT_EXPORT_MODULE(PushMarks);

- (dispatch_queue_t)methodQueue {
    return dispatch_get_main_queue();
}

RCT_EXPORT_METHOD(drain:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    NSString *appGroupId = @"group.io.chatic.dou";
    NSString *marksKey = @"push_marks";

    NSUserDefaults *defaults = [[NSUserDefaults alloc] initWithSuiteName:appGroupId];
    if (!defaults) {
        resolve(@[]);
        return;
    }

    NSArray *marks = [defaults arrayForKey:marksKey] ?: @[];
    [defaults removeObjectForKey:marksKey];
    resolve(marks);
}

@end
