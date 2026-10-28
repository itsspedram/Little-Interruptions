//! Is the user busy with something a bell should not interrupt?
//!
//! On macOS, calls, video players, presentations and many games ask the system
//! to keep the display awake. `pmset -g assertions` lists those requests, so
//! "someone is holding the display awake" is a cheap, permission-free signal
//! for "do not interrupt now". It does not see screen recordings that do not
//! hold the display awake, and an app that always holds it (a "keep awake"
//! utility) looks permanently busy, which is why smart pause can be switched off.
//! On other systems nobody is ever considered busy.

/// Reads the system-wide summary of `pmset -g assertions`. The part we want looks like:
///
/// ```text
/// Assertion status system-wide:
///    UserIsActive                   1
///    PreventUserIdleDisplaySleep    1
/// ```
///
/// Lines further down ("Listed by owning process") start with `pid`, so matching
/// the first word keeps them out.
fn display_held_awake(output: &str) -> bool {
    output.lines().any(|line| {
        let mut words = line.split_whitespace();
        words.next() == Some("PreventUserIdleDisplaySleep")
            && words
                .next()
                .and_then(|count| count.parse::<u32>().ok())
                .is_some_and(|count| count > 0)
    })
}

#[cfg(target_os = "macos")]
pub fn is_busy() -> bool {
    use std::process::Command;

    match Command::new("/usr/bin/pmset")
        .args(["-g", "assertions"])
        .output()
    {
        Ok(result) if result.status.success() => {
            display_held_awake(&String::from_utf8_lossy(&result.stdout))
        }
        _ => false,
    }
}

#[cfg(not(target_os = "macos"))]
pub fn is_busy() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::display_held_awake;

    const QUIET: &str = "\
2026-10-19 10:00:00 +0330
Assertion status system-wide:
   BackgroundTask                 0
   ApplePushServiceTask           0
   UserIsActive                   1
   PreventUserIdleDisplaySleep    0
   PreventSystemSleep             0
   ExternalMedia                  0
   PreventUserIdleSystemSleep     0
   NetworkClientActive            0
Listed by owning process:
   pid 123(powerd): [0x0001] 00:10:00 PreventUserIdleSystemSleep named: \"Powerd\"
";

    #[test]
    fn quiet_system_is_not_busy() {
        assert!(!display_held_awake(QUIET));
    }

    #[test]
    fn display_held_awake_is_busy() {
        let busy = QUIET.replace(
            "PreventUserIdleDisplaySleep    0",
            "PreventUserIdleDisplaySleep    1",
        );
        assert!(display_held_awake(&busy));
    }

    #[test]
    fn a_count_above_one_is_busy() {
        let busy = QUIET.replace(
            "PreventUserIdleDisplaySleep    0",
            "PreventUserIdleDisplaySleep    3",
        );
        assert!(display_held_awake(&busy));
    }

    #[test]
    fn per_process_lines_alone_do_not_count() {
        let output = "\
Assertion status system-wide:
   PreventUserIdleDisplaySleep    0
Listed by owning process:
   pid 77(zoom.us): [0x0002] 00:01:00 PreventUserIdleDisplaySleep named: \"Zoom\"
";
        assert!(!display_held_awake(output));
    }

    #[test]
    fn empty_or_unexpected_output_is_not_busy() {
        assert!(!display_held_awake(""));
        assert!(!display_held_awake("pmset: command not found"));
        assert!(!display_held_awake("PreventUserIdleDisplaySleep"));
        assert!(!display_held_awake("PreventUserIdleDisplaySleep    many"));
    }
}
