//! The main window's traffic lights, placed like a Mac unified toolbar.
//!
//! With `trafficLightPosition` in the config (tao and wry each re-apply it
//! from a drawRect), the lights still sat at AppKit's default spot on his
//! M4, about 6 pt above the top bar's nav row (his report, Nov 13). So the
//! config no longer sets it and this places them: a BAR_PT tall title bar,
//! the close button LEFT_PT from the left, all three centred vertically,
//! which is the centre of the web top bar (src/components/layout/top-bar.tsx,
//! --titlebar-h 52px). AppKit lays the title bar out again on its own (a
//! resize, a key change, a title change), so this re-places them from the
//! title bar container's frame-change notification, and lib.rs also calls
//! it on window events. Native fullscreen keeps AppKit's own placement.

pub const BAR_PT: f64 = 52.0;
pub const LEFT_PT: f64 = 20.0;

#[cfg(target_os = "macos")]
pub fn place(window: &tauri::Window) {
    if window.is_fullscreen().unwrap_or(false) {
        return;
    }
    let Ok(ns_window) = window.ns_window() else {
        return;
    };
    BURST.with(|b| b.set((None, 0)));
    unsafe { place_in(ns_window.cast()) }
}

#[cfg(not(target_os = "macos"))]
pub fn place(_window: &tauri::Window) {}

#[cfg(target_os = "macos")]
type Token =
    objc2::rc::Retained<objc2::runtime::ProtocolObject<dyn objc2::runtime::NSObjectProtocol>>;

#[cfg(target_os = "macos")]
thread_local! {
    /// The container being watched and its observer tokens, kept alive.
    static WATCHED: std::cell::RefCell<Option<(usize, Vec<Token>)>> =
        const { std::cell::RefCell::new(None) };
    /// Deferred repairs in the current second, so AppKit fighting a frame
    /// can't keep this busy forever.
    static BURST: std::cell::Cell<(Option<std::time::Instant>, u32)> =
        const { std::cell::Cell::new((None, 0)) };
}

#[cfg(target_os = "macos")]
unsafe fn place_in(win: *mut objc2::runtime::AnyObject) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    use objc2_foundation::NSRect;
    use std::sync::atomic::{AtomicBool, Ordering};

    // Our own setFrame posts the frame-change notification that calls this.
    static PLACING: AtomicBool = AtomicBool::new(false);
    if win.is_null() || PLACING.swap(true, Ordering::Relaxed) {
        return;
    }
    place_unguarded(win);
    PLACING.store(false, Ordering::Relaxed);

    // Once per launch, so the log says where they ended up, in window
    // coordinates (from the top).
    static LOGGED: AtomicBool = AtomicBool::new(false);
    let close: *mut AnyObject = msg_send![win, standardWindowButton: 0usize];
    if !close.is_null() && !LOGGED.swap(true, Ordering::Relaxed) {
        let b: NSRect = msg_send![close, bounds];
        let r: NSRect = msg_send![close, convertRect: b, toView: std::ptr::null_mut::<AnyObject>()];
        let w: NSRect = msg_send![win, frame];
        eprintln!(
            "[window] traffic lights placed: close centre at x {:.1} y {:.1} from the top ({}x{}), bar {} pt",
            r.origin.x + r.size.width / 2.0,
            w.size.height - (r.origin.y + r.size.height / 2.0),
            r.size.width,
            r.size.height,
            BAR_PT
        );
    }
}

#[cfg(target_os = "macos")]
unsafe fn place_unguarded(win: *mut objc2::runtime::AnyObject) {
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    use objc2_foundation::{NSPoint, NSRect};

    // Native fullscreen, including its transitions: AppKit owns the lights.
    let mask: usize = msg_send![win, styleMask];
    if mask & (1 << 14) != 0 {
        return;
    }
    // NSWindowCloseButton, MiniaturizeButton, ZoomButton.
    let buttons: [*mut AnyObject; 3] = [
        msg_send![win, standardWindowButton: 0usize],
        msg_send![win, standardWindowButton: 1usize],
        msg_send![win, standardWindowButton: 2usize],
    ];
    if buttons.iter().any(|b| b.is_null()) {
        return;
    }
    let titlebar: *mut AnyObject = msg_send![buttons[0], superview];
    let container: *mut AnyObject = if titlebar.is_null() {
        std::ptr::null_mut()
    } else {
        msg_send![titlebar, superview]
    };
    if container.is_null() {
        return;
    }
    let win_frame: NSRect = msg_send![win, frame];
    let mut bar: NSRect = msg_send![container, frame];
    bar.size.height = BAR_PT;
    bar.origin.y = win_frame.size.height - BAR_PT;
    let _: () = msg_send![container, setFrame: bar];
    // The buttons' own view has to cover the bar too, or the lower half of
    // a moved button can't be clicked.
    let inner = NSRect::new(NSPoint::new(0.0, 0.0), bar.size);
    let _: () = msg_send![titlebar, setFrame: inner];

    watch(win, container);

    let close: NSRect = msg_send![buttons[0], frame];
    let mini: NSRect = msg_send![buttons[1], frame];
    let step = mini.origin.x - close.origin.x;
    for (i, &button) in buttons.iter().enumerate() {
        let f: NSRect = msg_send![button, frame];
        let origin = NSPoint::new(
            LEFT_PT + i as f64 * step,
            ((BAR_PT - f.size.height) / 2.0).round(),
        );
        let _: () = msg_send![button, setFrameOrigin: origin];
    }
}

/// Re-place the lights after AppKit changes the title bar container's or
/// the close button's frame, which it does without any window event (a title
/// change resets them). The repair waits for the next main-queue turn, after
/// AppKit's own layout pass, and repeat notifications collapse into one.
#[cfg(target_os = "macos")]
unsafe fn watch(win: *mut objc2::runtime::AnyObject, container: *mut objc2::runtime::AnyObject) {
    use block2::RcBlock;
    use objc2::msg_send;
    use objc2::runtime::AnyObject;
    use objc2_app_kit::NSViewFrameDidChangeNotification;
    use objc2_foundation::{NSNotification, NSNotificationCenter, NSOperationQueue};
    use std::ptr::NonNull;

    let key = container as usize;
    if WATCHED.with(|w| w.borrow().as_ref().map(|(k, _)| *k) == Some(key)) {
        return;
    }
    let close: *mut AnyObject = msg_send![win, standardWindowButton: 0usize];
    let win_addr = win as usize;
    let center = NSNotificationCenter::defaultCenter();
    let mut tokens = Vec::new();
    for view in [container, close] {
        if view.is_null() {
            continue;
        }
        let _: () = msg_send![view, setPostsFrameChangedNotifications: true];
        let block = RcBlock::new(move |_note: NonNull<NSNotification>| {
            schedule_repair(win_addr);
        });
        tokens.push(center.addObserverForName_object_queue_usingBlock(
            Some(NSViewFrameDidChangeNotification),
            Some(&*view),
            Some(&NSOperationQueue::mainQueue()),
            &block,
        ));
    }
    WATCHED.with(|w| {
        if let Some((_, old)) = w.borrow_mut().replace((key, tokens)) {
            for t in old {
                let t: &AnyObject = (*t).as_ref();
                center.removeObserver(t);
            }
        }
    });
}

#[cfg(target_os = "macos")]
fn schedule_repair(win_addr: usize) {
    use block2::RcBlock;
    use objc2_foundation::NSOperationQueue;
    use std::sync::atomic::{AtomicBool, Ordering};

    static PENDING: AtomicBool = AtomicBool::new(false);
    if PENDING.swap(true, Ordering::Relaxed) {
        return;
    }
    let block = RcBlock::new(move || {
        PENDING.store(false, Ordering::Relaxed);
        let now = std::time::Instant::now();
        let (start, n) = BURST.with(|b| b.get());
        // Latched once exceeded, until a window event clears it in place().
        if n > 8 {
            return;
        }
        let (start, n) = match start {
            Some(t) if now.duration_since(t).as_secs_f64() < 1.0 => (t, n + 1),
            _ => (now, 1),
        };
        BURST.with(|b| b.set((Some(start), n)));
        if n == 9 {
            eprintln!("[window] traffic lights: AppKit keeps moving them; leaving them until the next window event");
        }
        if n > 8 {
            return;
        }
        unsafe { place_in(win_addr as *mut objc2::runtime::AnyObject) };
    });
    // SAFETY: the block runs on the main queue, where the window lives.
    unsafe { NSOperationQueue::mainQueue().addOperationWithBlock(&block) };
}
