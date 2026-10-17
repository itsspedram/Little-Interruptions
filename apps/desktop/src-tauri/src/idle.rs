//! How long ago the user last touched the keyboard or mouse, in seconds.
//!
//! Implemented with the operating system's own call on macOS and Windows, so
//! no extra crate is needed. On other systems the user always counts as active.

/// macOS: ask the HID system for the time since any input event.
#[cfg(target_os = "macos")]
pub fn idle_seconds() -> f64 {
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn CGEventSourceSecondsSinceLastEventType(state_id: i32, event_type: u32) -> f64;
    }

    // kCGEventSourceStateCombinedSessionState and kCGAnyInputEventType (all bits set).
    const COMBINED_SESSION_STATE: i32 = 0;
    const ANY_INPUT_EVENT_TYPE: u32 = u32::MAX;

    // SAFETY: a plain C function that takes two integers and returns a double.
    let seconds = unsafe {
        CGEventSourceSecondsSinceLastEventType(COMBINED_SESSION_STATE, ANY_INPUT_EVENT_TYPE)
    };
    if seconds.is_finite() && seconds >= 0.0 {
        seconds
    } else {
        0.0
    }
}

/// Windows: GetLastInputInfo gives the tick count of the last input event.
#[cfg(target_os = "windows")]
pub fn idle_seconds() -> f64 {
    #[repr(C)]
    struct LastInputInfo {
        size: u32,
        time: u32,
    }

    #[link(name = "user32")]
    extern "system" {
        fn GetLastInputInfo(info: *mut LastInputInfo) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetTickCount() -> u32;
    }

    let mut info = LastInputInfo {
        size: std::mem::size_of::<LastInputInfo>() as u32,
        time: 0,
    };

    // SAFETY: `info` is a valid, correctly sized LASTINPUTINFO that outlives the call.
    let ok = unsafe { GetLastInputInfo(&mut info) };
    if ok == 0 {
        return 0.0;
    }
    // SAFETY: GetTickCount takes no arguments and has no side effects.
    let now = unsafe { GetTickCount() };
    f64::from(now.wrapping_sub(info.time)) / 1000.0
}

/// Everywhere else: no idle detection, so the user always counts as active.
#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn idle_seconds() -> f64 {
    0.0
}
