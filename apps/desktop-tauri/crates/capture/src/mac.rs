#![allow(unsafe_code)]

use std::ptr::NonNull;
use std::sync::mpsc::Sender;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage};
use objc2_foundation::{MainThreadMarker, NSDictionary, NSError};
use objc2_web_kit::{WKSnapshotConfiguration, WKWebView};
use tauri::webview::PlatformWebview;

type Reply = Sender<Result<Vec<u8>, String>>;

fn encode(image: &NSImage) -> Result<Vec<u8>, String> {
    let tiff = image
        .TIFFRepresentation()
        .ok_or("the snapshot has no pixels")?;
    let rep = NSBitmapImageRep::imageRepWithData(&tiff).ok_or("the snapshot cannot be decoded")?;
    let properties = NSDictionary::<objc2_app_kit::NSBitmapImageRepPropertyKey, AnyObject>::new();
    let data =
        unsafe { rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &properties) }
            .ok_or("the snapshot cannot be encoded")?;
    Ok(data.to_vec())
}

pub fn snapshot(webview: &PlatformWebview, reply: Reply) {
    let Some(mtm) = MainThreadMarker::new() else {
        let _ = reply.send(Err("the snapshot must start on the main thread".into()));
        return;
    };
    let view: &WKWebView = unsafe { &*webview.inner().cast::<WKWebView>() };
    let config = unsafe { WKSnapshotConfiguration::new(mtm) };
    let done = reply.clone();
    let handler = RcBlock::new(move |image: *mut NSImage, error: *mut NSError| {
        let outcome = match NonNull::new(image) {
            Some(image) => {
                encode(&unsafe { Retained::retain(image.as_ptr()) }.expect("retained image"))
            }
            None => Err(match NonNull::new(error) {
                Some(error) => unsafe { error.as_ref() }.localizedDescription().to_string(),
                None => "the snapshot failed".to_string(),
            }),
        };
        let _ = done.send(outcome);
    });
    unsafe { view.takeSnapshotWithConfiguration_completionHandler(Some(&config), &handler) };
}
