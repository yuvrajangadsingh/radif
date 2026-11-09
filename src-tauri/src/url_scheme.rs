//! The `radif://` URL scheme (macOS), so Raycast, Alfred and Shortcuts can
//! drive the app. macOS hands opened URLs to the app as `RunEvent::Opened`
//! (the scheme is registered in `Info.plist`). They queue here and the
//! webview drains them: on the `radif-url` event, and once when it mounts,
//! so a URL that launched the app isn't lost before the page is ready.
//! What each URL may do is decided in the webview (`lib/url-scheme.ts`):
//! playback and opening search only, nothing that sticks.

use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct PendingUrls(Mutex<Vec<String>>);

pub fn opened(app: &AppHandle, urls: &[tauri::Url]) {
    let ours: Vec<String> = urls
        .iter()
        .filter(|u| u.scheme() == "radif")
        .map(|u| u.to_string())
        .collect();
    if ours.is_empty() {
        return;
    }
    // Search is the one action with something to look at.
    if urls.iter().any(|u| u.host_str() == Some("search")) {
        super::show_main_window(app);
    }
    if let Ok(mut q) = app.state::<PendingUrls>().0.lock() {
        q.extend(ours);
    }
    let _ = app.emit("radif-url", ());
}

#[tauri::command]
pub fn radif_url_drain(state: State<'_, PendingUrls>) -> Vec<String> {
    state.0.lock().map(|mut q| std::mem::take(&mut *q)).unwrap_or_default()
}
