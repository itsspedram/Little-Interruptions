//! Plays the bell through the operating system, not through the web view.
//! Web audio in a hidden window is unreliable, and this way the sound still
//! plays when the popup is on another screen or the app is in the background.

use std::thread;

static BELL_WAV: &[u8] = include_bytes!("../assets/bell.wav");

/// Starts the bell and returns immediately.
pub fn play_bell() {
    thread::spawn(play_blocking);
}

#[cfg(target_os = "macos")]
fn play_blocking() {
    use std::{fs, process::Command};

    // macOS keeps temp files in a per-user folder, so a fixed name is safe here.
    let path = std::env::temp_dir().join("little-interruptions-bell.wav");
    let up_to_date = fs::metadata(&path)
        .map(|meta| meta.len() == BELL_WAV.len() as u64)
        .unwrap_or(false);
    if !up_to_date && fs::write(&path, BELL_WAV).is_err() {
        return;
    }
    let _ = Command::new("/usr/bin/afplay").arg(&path).status();
}

#[cfg(target_os = "windows")]
fn play_blocking() {
    #[link(name = "winmm")]
    extern "system" {
        fn PlaySoundW(sound: *const u16, module: *mut core::ffi::c_void, flags: u32) -> i32;
    }

    const SND_SYNC: u32 = 0x0000;
    const SND_MEMORY: u32 = 0x0004;

    // SAFETY: with SND_MEMORY the pointer is read as a WAV image; BELL_WAV is
    // 'static, and SND_SYNC keeps this thread inside the call until playback ends.
    unsafe {
        PlaySoundW(
            BELL_WAV.as_ptr().cast::<u16>(),
            core::ptr::null_mut(),
            SND_MEMORY | SND_SYNC,
        );
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn play_blocking() {
    use std::{fs, process::Command};

    let path = std::env::temp_dir().join("little-interruptions-bell.wav");
    if fs::write(&path, BELL_WAV).is_ok() {
        let _ = Command::new("aplay").arg("-q").arg(&path).status();
    }
}
