/*
 * Put first in every page the web serves through the virtual shell's proxy, ahead of the page's own
 * scripts — the moment react-native-webview injects the app's boot script. Kept to a call into the
 * page holding the frame (same origin), which does the work: the app's boot script, the
 * `ReactNativeWebView` bridge, the console relay.
 */
(function () {
    if (window.top === window) {
        // Opened on its own (a browser pointed at the server's root): without the shell around it the
        // web would boot believing it is inside the app. Stop loading and go to the shell instead.
        window.stop();
        window.location.replace('/__shell/');
        return;
    }
    var attach = window.parent && window.parent.__virtualShellAttach;
    // The frame carries the launch it was drawn for; the shell turns away a frame of an earlier one.
    var frame = window.frameElement;
    if (typeof attach === 'function') attach(window, frame ? frame.getAttribute('data-launch') : null);
})();
