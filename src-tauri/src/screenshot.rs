//! Region/window screenshot capture (ported from hermes-orb).
//!
//! A custom in-app capture flow. `screenshot_open` parks the transparent
//! `screenshot-overlay` window over the monitor under the cursor; the overlay's
//! React UI lets the user draw / adjust a selection rectangle or click a window.
//! `screenshot_grab` converts the overlay-local selection to global screen
//! points, hides the overlay so it isn't in the shot, and on macOS shells the
//! native `screencapture -R x,y,w,h` (points; Retina scaling handled by the OS)
//! to grab the region to a temp PNG (and optionally the clipboard); elsewhere it
//! crops an `xcap` monitor grab. The captured path is broadcast as
//! `screenshot:captured`, which the cockpit injects into the embedded terminal.

use tauri::{AppHandle, Emitter, LogicalPosition, LogicalSize, Manager};

fn err_string<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Position the overlay over the monitor under the cursor and show it.
#[tauri::command]
pub async fn screenshot_open(app: AppHandle) -> Result<(), String> {
    let win = app
        .get_webview_window("screenshot-overlay")
        .ok_or_else(|| "screenshot-overlay window not found".to_string())?;
    // Pick the monitor under the cursor, falling back to the primary.
    let monitor = match app.cursor_position() {
        Ok(p) => app.monitor_from_point(p.x, p.y).ok().flatten(),
        Err(_) => None,
    };
    let monitor = match monitor {
        Some(m) => Some(m),
        None => app.primary_monitor().ok().flatten(),
    };
    if let Some(m) = monitor {
        let scale = m.scale_factor();
        let pos = m.position();
        let size = m.size();
        win.set_position(LogicalPosition::new(
            pos.x as f64 / scale,
            pos.y as f64 / scale,
        ))
        .map_err(err_string)?;
        win.set_size(LogicalSize::new(
            (size.width as f64 / scale).max(1.0),
            (size.height as f64 / scale).max(1.0),
        ))
        .map_err(err_string)?;
    }
    win.show().map_err(err_string)?;
    let _ = win.set_always_on_top(true);
    let _ = win.set_focus();
    // Clear any stale selection from a previous capture.
    let _ = app.emit_to("screenshot-overlay", "screenshot:reset", ());
    Ok(())
}

/// Hide the overlay without capturing (Esc / ✕).
#[tauri::command]
pub async fn screenshot_cancel(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("screenshot-overlay") {
        let _ = win.hide();
    }
    Ok(())
}

/// Non-macOS region capture. Captures the monitor under the selection with
/// `xcap`, crops it to the overlay-local rect (× scale → physical px), saves a
/// PNG, and optionally writes it to the clipboard via `arboard`. macOS uses the
/// native `screencapture` path instead.
#[cfg(not(target_os = "macos"))]
#[allow(clippy::too_many_arguments)]
fn capture_region_xcap(
    overlay_pos_x: i32,
    overlay_pos_y: i32,
    scale: f64,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    out_path: &str,
    to_clip: bool,
) -> Result<(), String> {
    // Physical screen point at the selection's centre, to find its monitor.
    let rcx = overlay_pos_x + ((x + width / 2.0) * scale).round() as i32;
    let rcy = overlay_pos_y + ((y + height / 2.0) * scale).round() as i32;
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let monitor = monitors
        .into_iter()
        .find(|m| {
            let (mx, my) = (m.x(), m.y());
            let (mw, mh) = (m.width() as i32, m.height() as i32);
            rcx >= mx && rcx < mx + mw && rcy >= my && rcy < my + mh
        })
        .ok_or_else(|| "no monitor under selection".to_string())?;
    let (mx, my) = (monitor.x(), monitor.y());
    let shot = monitor.capture_image().map_err(|e| e.to_string())?;
    let (iw, ih) = (shot.width(), shot.height());
    // Rebuild via this crate's `image` version from the raw RGBA bytes so the
    // crop/save/clipboard all use one image crate.
    let full: image::RgbaImage = image::ImageBuffer::from_raw(iw, ih, shot.into_raw())
        .ok_or_else(|| "capture buffer size mismatch".to_string())?;
    let off_x = overlay_pos_x - mx;
    let off_y = overlay_pos_y - my;
    let px = ((x * scale).round() as i32 + off_x).max(0) as u32;
    let py = ((y * scale).round() as i32 + off_y).max(0) as u32;
    if px >= iw || py >= ih {
        return Err("selection outside the monitor".to_string());
    }
    let pw = ((width * scale).round().max(1.0) as u32).min(iw - px);
    let ph = ((height * scale).round().max(1.0) as u32).min(ih - py);
    let cropped = image::imageops::crop_imm(&full, px, py, pw, ph).to_image();
    cropped.save(out_path).map_err(|e| e.to_string())?;
    if to_clip {
        let mut cb = arboard::Clipboard::new().map_err(|e| e.to_string())?;
        cb.set_image(arboard::ImageData {
            width: pw as usize,
            height: ph as usize,
            bytes: std::borrow::Cow::Owned(cropped.into_raw()),
        })
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Capture the selected region. `x`/`y`/`width`/`height` are overlay-local
/// logical points (CSS px). On macOS we add the overlay's logical origin and
/// use the native `screencapture -R`; elsewhere we crop an `xcap` monitor grab.
/// Returns the temp PNG path and broadcasts `screenshot:captured`.
#[tauri::command]
pub async fn screenshot_grab(
    app: AppHandle,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    clipboard: Option<bool>,
) -> Result<String, String> {
    let win = app
        .get_webview_window("screenshot-overlay")
        .ok_or_else(|| "screenshot-overlay window not found".to_string())?;
    let scale = win.scale_factor().map_err(err_string)?;
    let pos = win.outer_position().map_err(err_string)?;
    let to_clip = clipboard.unwrap_or(true);

    // Hide the overlay BEFORE capturing so its dimming/selection chrome isn't
    // baked into the shot; the blocking task sleeps briefly to let the
    // compositor actually drop it.
    let _ = win.hide();

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path = std::env::temp_dir().join(format!("theoi-shot-{ts}.png"));
    let path_str = path.to_string_lossy().to_string();
    let task_path = path_str.clone();

    #[cfg(target_os = "macos")]
    {
        let ox = pos.x as f64 / scale;
        let oy = pos.y as f64 / scale;
        let gx = (ox + x).round() as i64;
        let gy = (oy + y).round() as i64;
        let gw = width.round().max(1.0) as i64;
        let gh = height.round().max(1.0) as i64;
        let region = format!("{gx},{gy},{gw},{gh}");
        tauri::async_runtime::spawn_blocking(move || {
            std::thread::sleep(std::time::Duration::from_millis(140));
            let _ = std::process::Command::new("screencapture")
                .args(["-x", "-R", &region, &task_path])
                .status();
            if to_clip {
                let _ = std::process::Command::new("screencapture")
                    .args(["-x", "-c", "-R", &region])
                    .status();
            }
        })
        .await
        .map_err(err_string)?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let pos_x = pos.x;
        let pos_y = pos.y;
        tauri::async_runtime::spawn_blocking(move || {
            std::thread::sleep(std::time::Duration::from_millis(140));
            capture_region_xcap(
                pos_x, pos_y, scale, x, y, width, height, &task_path, to_clip,
            )
        })
        .await
        .map_err(err_string)??;
    }

    if !path.exists() {
        return Err("capture produced no file (selection may be empty)".to_string());
    }
    let _ = app.emit("screenshot:captured", path_str.clone());
    Ok(path_str)
}

/// A window rectangle in overlay-local logical points (CSS px), for the
/// overlay's window-capture mode.
#[derive(serde::Serialize)]
pub struct WinRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// Windows under the overlay, mapped to overlay-local logical points. The
/// overlay highlights the one under the cursor and selects its rect on click.
#[tauri::command]
pub async fn screenshot_windows(app: AppHandle) -> Result<Vec<WinRect>, String> {
    #[cfg(target_os = "macos")]
    {
        let win = app
            .get_webview_window("screenshot-overlay")
            .ok_or_else(|| "screenshot-overlay window not found".to_string())?;
        let scale = win.scale_factor().map_err(err_string)?;
        let pos = win.outer_position().map_err(err_string)?;
        let size = win.inner_size().map_err(err_string)?;
        let ox = pos.x as f64 / scale;
        let oy = pos.y as f64 / scale;
        let ow = size.width as f64 / scale;
        let oh = size.height as f64 / scale;
        let mut out = Vec::new();
        for (x, y, w, h) in enumerate_windows_global() {
            let lx = x - ox;
            let ly = y - oy;
            // Keep only windows that intersect this monitor's overlay.
            if lx + w <= 0.0 || ly + h <= 0.0 || lx >= ow || ly >= oh {
                continue;
            }
            out.push(WinRect {
                x: lx,
                y: ly,
                width: w,
                height: h,
            });
        }
        Ok(out)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Ok(Vec::new())
    }
}

/// Enumerate on-screen, normal-layer windows with their global screen bounds in
/// points, via CoreGraphics. Excludes our own app's windows, the menu bar / dock
/// (non-zero layer), fully transparent windows, and tiny windows.
#[cfg(target_os = "macos")]
fn enumerate_windows_global() -> Vec<(f64, f64, f64, f64)> {
    use core_foundation::array::{CFArrayGetCount, CFArrayGetValueAtIndex, CFArrayRef};
    use core_foundation::base::{CFRelease, TCFType};
    use core_foundation::dictionary::{CFDictionaryGetValueIfPresent, CFDictionaryRef};
    use core_foundation::number::{CFNumber, CFNumberRef};
    use core_foundation::string::CFString;
    use std::os::raw::c_void;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGWindowListCopyWindowInfo(option: u32, relative_to_window: u32) -> CFArrayRef;
    }
    const ON_SCREEN_ONLY: u32 = 1 << 0;
    const EXCLUDE_DESKTOP: u32 = 1 << 4;

    let mut out = Vec::new();
    let my_pid = std::process::id() as i64;
    let arr: CFArrayRef =
        unsafe { CGWindowListCopyWindowInfo(ON_SCREEN_ONLY | EXCLUDE_DESKTOP, 0) };
    if arr.is_null() {
        return out;
    }

    let num_at = |dict: CFDictionaryRef, key: &str| -> Option<CFNumber> {
        let k = CFString::new(key);
        let mut v: *const c_void = std::ptr::null();
        let found = unsafe {
            CFDictionaryGetValueIfPresent(dict, k.as_concrete_TypeRef() as *const c_void, &mut v)
        };
        if found != 0 && !v.is_null() {
            Some(unsafe { CFNumber::wrap_under_get_rule(v as CFNumberRef) })
        } else {
            None
        }
    };

    let count = unsafe { CFArrayGetCount(arr) };
    for i in 0..count {
        let dict = unsafe { CFArrayGetValueAtIndex(arr, i) } as CFDictionaryRef;
        if dict.is_null() {
            continue;
        }
        // Normal app windows only: layer 0 excludes the menu bar / Control
        // Center (25), Dock (20), notifications, etc.
        let layer = num_at(dict, "kCGWindowLayer")
            .and_then(|n| n.to_i64())
            .unwrap_or(-999);
        if layer != 0 {
            continue;
        }
        let pid = num_at(dict, "kCGWindowOwnerPID")
            .and_then(|n| n.to_i64())
            .unwrap_or(0);
        if pid == my_pid {
            continue;
        }
        let alpha = num_at(dict, "kCGWindowAlpha")
            .and_then(|n| n.to_f64())
            .unwrap_or(1.0);
        if alpha <= 0.01 {
            continue;
        }
        // kCGWindowBounds → { X, Y, Width, Height } in global points.
        let bget = |key: &str| -> f64 {
            let bkey = CFString::new("kCGWindowBounds");
            let mut bptr: *const c_void = std::ptr::null();
            let bf = unsafe {
                CFDictionaryGetValueIfPresent(
                    dict,
                    bkey.as_concrete_TypeRef() as *const c_void,
                    &mut bptr,
                )
            };
            if bf == 0 || bptr.is_null() {
                return 0.0;
            }
            let bdict = bptr as CFDictionaryRef;
            let ik = CFString::new(key);
            let mut vv: *const c_void = std::ptr::null();
            let f = unsafe {
                CFDictionaryGetValueIfPresent(
                    bdict,
                    ik.as_concrete_TypeRef() as *const c_void,
                    &mut vv,
                )
            };
            if f != 0 && !vv.is_null() {
                unsafe { CFNumber::wrap_under_get_rule(vv as CFNumberRef) }
                    .to_f64()
                    .unwrap_or(0.0)
            } else {
                0.0
            }
        };
        let (x, y, w, h) = (bget("X"), bget("Y"), bget("Width"), bget("Height"));
        if w < 24.0 || h < 24.0 {
            continue;
        }
        out.push((x, y, w, h));
    }
    unsafe { CFRelease(arr as *const c_void) };
    out
}
