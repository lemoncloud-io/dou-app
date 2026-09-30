#import <React/RCTBridgeModule.h>
#import <UIKit/UIKit.h>

/**
 * Plays the short haptics the web asks for at a gesture's decisive moment (a row swipe reaching its
 * actions, a pull reaching the refresh point). The WebView has no haptics of its own on iOS —
 * WebKit does not implement `navigator.vibrate` — so the page has to ask the shell.
 *
 * The kinds are feels, not gestures: `selection` is the system's selection tick, `impact` a light
 * impact. Anything else is ignored, so a newer web asking for a kind this build does not know
 * simply gets no buzz. The generators are kept so a second tick does not pay their set-up again,
 * and UIKit already skips them when the user has turned system haptics off.
 */
@interface HapticModule : NSObject <RCTBridgeModule>
@end

@implementation HapticModule {
    UISelectionFeedbackGenerator *_selection;
    UIImpactFeedbackGenerator *_impact;
}

RCT_EXPORT_MODULE(Haptic);

- (dispatch_queue_t)methodQueue {
    // Feedback generators are UIKit objects and must be used on the main thread.
    return dispatch_get_main_queue();
}

RCT_EXPORT_METHOD(trigger:(NSString *)kind) {
    if ([kind isEqualToString:@"selection"]) {
        if (!_selection) _selection = [UISelectionFeedbackGenerator new];
        [_selection selectionChanged];
    } else if ([kind isEqualToString:@"impact"]) {
        if (!_impact) _impact = [[UIImpactFeedbackGenerator alloc] initWithStyle:UIImpactFeedbackStyleLight];
        [_impact impactOccurred];
    }
}

@end
