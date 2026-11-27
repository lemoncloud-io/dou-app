#![allow(unsafe_code)]

use std::sync::mpsc::Sender;

use tauri::webview::PlatformWebview;
use webview2_com::CapturePreviewCompletedHandler;
use webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG;
use windows::Win32::System::Com::{IStream, STREAM_SEEK_END, STREAM_SEEK_SET};
use windows::Win32::UI::Shell::SHCreateMemStream;

type Reply = Sender<Result<Vec<u8>, String>>;

fn read_all(stream: &IStream) -> windows::core::Result<Vec<u8>> {
    let mut size = 0u64;
    unsafe {
        stream.Seek(0, STREAM_SEEK_END, Some(&mut size))?;
        stream.Seek(0, STREAM_SEEK_SET, None)?;
    }
    let mut bytes = vec![0u8; size as usize];
    let mut read = 0u32;
    unsafe {
        stream
            .Read(
                bytes.as_mut_ptr().cast(),
                bytes.len() as u32,
                Some(&mut read),
            )
            .ok()?;
    }
    bytes.truncate(read as usize);
    Ok(bytes)
}

pub fn snapshot(webview: &PlatformWebview, reply: Reply) {
    let core = match unsafe { webview.controller().CoreWebView2() } {
        Ok(core) => core,
        Err(e) => {
            let _ = reply.send(Err(e.to_string()));
            return;
        }
    };
    let Some(stream) = (unsafe { SHCreateMemStream(None) }) else {
        let _ = reply.send(Err("cannot create a memory stream".into()));
        return;
    };
    let target = stream.clone();
    let done = reply.clone();
    let handler = CapturePreviewCompletedHandler::create(Box::new(move |result| {
        let outcome = result
            .map_err(|e| e.to_string())
            .and_then(|()| read_all(&target).map_err(|e| e.to_string()));
        let _ = done.send(outcome);
        Ok(())
    }));
    if let Err(e) = unsafe {
        core.CapturePreview(
            COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG,
            &stream,
            &handler,
        )
    } {
        let _ = reply.send(Err(e.to_string()));
    }
}
