//! Is a microphone being used right now?
//!
//! A call, a recording or a dictation keeps an input device running. macOS
//! tells us this through CoreAudio ("is this device running somewhere?"), which
//! needs no permission because we never open the microphone, only ask whether
//! something else has. A headset that is both speaker and microphone can look
//! "in use" while it only plays sound. On other systems this always says no.

/// Four-character codes, the way CoreAudio names its properties.
const fn fourcc(code: &[u8; 4]) -> u32 {
    u32::from_be_bytes(*code)
}

#[cfg(target_os = "macos")]
mod macos {
    use super::fourcc;
    use std::ffi::c_void;
    use std::ptr::null;

    #[repr(C)]
    struct PropertyAddress {
        selector: u32,
        scope: u32,
        element: u32,
    }

    #[link(name = "CoreAudio", kind = "framework")]
    extern "C" {
        fn AudioObjectGetPropertyDataSize(
            object: u32,
            address: *const PropertyAddress,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: *mut u32,
        ) -> i32;
        fn AudioObjectGetPropertyData(
            object: u32,
            address: *const PropertyAddress,
            qualifier_size: u32,
            qualifier: *const c_void,
            size: *mut u32,
            data: *mut c_void,
        ) -> i32;
    }

    const SYSTEM_OBJECT: u32 = 1;
    const MAIN_ELEMENT: u32 = 0;

    fn address(selector: &[u8; 4], scope: &[u8; 4]) -> PropertyAddress {
        PropertyAddress {
            selector: fourcc(selector),
            scope: fourcc(scope),
            element: MAIN_ELEMENT,
        }
    }

    fn device_ids() -> Vec<u32> {
        let wanted = address(b"dev#", b"glob");
        let mut size: u32 = 0;
        // SAFETY: plain CoreAudio queries; every pointer refers to a live local.
        let ok =
            unsafe { AudioObjectGetPropertyDataSize(SYSTEM_OBJECT, &wanted, 0, null(), &mut size) };
        if ok != 0 || size == 0 {
            return Vec::new();
        }
        let mut ids = vec![0u32; size as usize / 4];
        let mut filled = size;
        // SAFETY: `ids` has room for `size` bytes, as CoreAudio asked.
        let ok = unsafe {
            AudioObjectGetPropertyData(
                SYSTEM_OBJECT,
                &wanted,
                0,
                null(),
                &mut filled,
                ids.as_mut_ptr().cast::<c_void>(),
            )
        };
        if ok != 0 {
            return Vec::new();
        }
        ids.truncate(filled as usize / 4);
        ids
    }

    fn has_input(device: u32) -> bool {
        let wanted = address(b"stm#", b"inpt");
        let mut size: u32 = 0;
        // SAFETY: as above.
        let ok = unsafe { AudioObjectGetPropertyDataSize(device, &wanted, 0, null(), &mut size) };
        ok == 0 && size > 0
    }

    fn running_somewhere(device: u32) -> bool {
        let wanted = address(b"gone", b"glob");
        let mut value: u32 = 0;
        let mut size = std::mem::size_of::<u32>() as u32;
        // SAFETY: `value` is a u32 and `size` says so.
        let ok = unsafe {
            AudioObjectGetPropertyData(
                device,
                &wanted,
                0,
                null(),
                &mut size,
                (&mut value as *mut u32).cast::<c_void>(),
            )
        };
        ok == 0 && value != 0
    }

    pub fn in_use() -> bool {
        device_ids()
            .into_iter()
            .any(|device| has_input(device) && running_somewhere(device))
    }
}

#[cfg(target_os = "macos")]
pub fn is_in_use() -> bool {
    macos::in_use()
}

#[cfg(not(target_os = "macos"))]
pub fn is_in_use() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::fourcc;

    #[test]
    fn four_character_codes_match_coreaudio_values() {
        assert_eq!(fourcc(b"dev#"), 0x6465_7623);
        assert_eq!(fourcc(b"glob"), 0x676c_6f62);
        assert_eq!(fourcc(b"inpt"), 0x696e_7074);
    }
}
