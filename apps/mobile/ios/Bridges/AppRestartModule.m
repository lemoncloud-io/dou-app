#import <React/RCTBridgeModule.h>
#import <React/RCTReloadCommand.h>

/**
 * Starts the app's JS context over: the bundle is evaluated again and every JS module begins from
 * nothing, while the process, the native modules and what they keep on disk stay. The app uses it when
 * the in-memory state of a whole JS run has to go — after a session its own runtime held has ended —
 * which no single module can promise to drop by itself.
 *
 * `DevSettings.reload` does the same in a debug build only; in a release build its JS side is a no-op.
 * The reload command below is the one the React host listens to in every build.
 *
 * It answers before the reload, since the context that asked does not survive it.
 */
@interface AppRestartModule : NSObject <RCTBridgeModule>
@end

@implementation AppRestartModule

RCT_EXPORT_MODULE(AppRestart);

+ (BOOL)requiresMainQueueSetup {
    return NO;
}

RCT_EXPORT_METHOD(reload:(NSString *)reason
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    resolve(@YES);
    NSString *why = reason.length > 0 ? reason : @"AppRestart";
    // On the next main-queue turn, so the answer above reaches JS before the context goes.
    dispatch_async(dispatch_get_main_queue(), ^{
        RCTTriggerReloadCommandListeners(why);
    });
}

@end
