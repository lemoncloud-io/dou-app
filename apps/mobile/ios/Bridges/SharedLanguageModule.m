#import <React/RCTBridgeModule.h>

/**
 * Copies the language choice the web made in Settings into the shared App Group store, where the
 * Notification Service Extension reads it to pick the locale file for a background push banner. The
 * extension runs in its own process and cannot reach the app's preference store.
 *
 * App Group id and key must match `NotificationService.swift`'s `appGroupId`/`languagePreferenceKey`.
 * The value is `system`, `ko` or `en`, already validated by the JS side; anything else is stored as
 * `system` so the extension falls back to the device language.
 */
@interface SharedLanguageModule : NSObject <RCTBridgeModule>
@end

@implementation SharedLanguageModule

RCT_EXPORT_MODULE(SharedLanguage);

- (dispatch_queue_t)methodQueue {
    return dispatch_get_main_queue();
}

RCT_EXPORT_METHOD(set:(NSString *)preference
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject) {
    NSString *appGroupId = @"group.io.chatic.dou";
    NSString *languageKey = @"language_preference";

    NSUserDefaults *defaults = [[NSUserDefaults alloc] initWithSuiteName:appGroupId];
    if (!defaults) {
        reject(@"SHARED_LANGUAGE_UNAVAILABLE", @"App Group defaults are unavailable", nil);
        return;
    }

    BOOL known = [@[@"system", @"ko", @"en"] containsObject:preference ?: @""];
    [defaults setObject:(known ? preference : @"system") forKey:languageKey];
    resolve(@YES);
}

@end
