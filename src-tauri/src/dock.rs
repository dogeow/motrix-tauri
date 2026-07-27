//! macOS Dock tile overlays.
//!
//! Tauri already adds a progress indicator to the Dock tile. These tagged
//! text fields share the same content view so speed labels and progress can
//! remain visible at the same time.

use objc2::{
    class, msg_send,
    runtime::{AnyObject, Bool},
};
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};

type Id = *mut AnyObject;
const NIL: Id = std::ptr::null_mut();

const DOWNLOAD_LABEL_TAG: isize = 73_011;
const DOWNLOAD_ARROW_TAG: isize = 73_012;
const UPLOAD_LABEL_TAG: isize = 73_021;
const UPLOAD_ARROW_TAG: isize = 73_022;

/// Must be called on AppKit's main thread.
pub fn set_speeds(download: Option<&str>, upload: Option<&str>) {
    unsafe {
        let app: Id = msg_send![class!(NSApplication), sharedApplication];
        let dock_tile: Id = msg_send![app, dockTile];
        if dock_tile == NIL {
            return;
        }

        let content_view = ensure_content_view(app, dock_tile);
        if content_view == NIL {
            return;
        }

        match (download, upload) {
            (Some(download), Some(upload)) => {
                let size: NSSize = msg_send![dock_tile, size];
                update_row(
                    content_view,
                    DOWNLOAD_LABEL_TAG,
                    DOWNLOAD_ARROW_TAG,
                    download,
                    "▼",
                    true,
                    size,
                    0.53,
                );
                update_row(
                    content_view,
                    UPLOAD_LABEL_TAG,
                    UPLOAD_ARROW_TAG,
                    upload,
                    "▲",
                    false,
                    size,
                    0.28,
                );
            }
            _ => remove_speed_labels(content_view),
        }

        let _: () = msg_send![dock_tile, display];
    }
}

unsafe fn ensure_content_view(app: Id, dock_tile: Id) -> Id {
    let mut content_view: Id = msg_send![dock_tile, contentView];
    if content_view == NIL {
        let app_icon: Id = msg_send![app, applicationIconImage];
        content_view = msg_send![class!(NSImageView), imageViewWithImage: app_icon];
        let _: () = msg_send![dock_tile, setContentView: content_view];
    }
    content_view
}

#[allow(clippy::too_many_arguments)]
unsafe fn update_row(
    content_view: Id,
    label_tag: isize,
    arrow_tag: isize,
    speed: &str,
    arrow: &str,
    is_download: bool,
    tile_size: NSSize,
    y_ratio: f64,
) {
    let row_height = (tile_size.height * 0.22).max(22.0);
    let row_width = tile_size.width * 0.9;
    let row_x = tile_size.width * 0.05;
    let row_y = tile_size.height * y_ratio;
    let row_frame = NSRect::new(
        NSPoint::new(row_x, row_y),
        NSSize::new(row_width, row_height),
    );

    let label = find_or_create_label(content_view, label_tag, true);
    let value = NSString::from_str(&format!("   {speed}"));
    let _: () = msg_send![label, setStringValue: &*value];
    let _: () = msg_send![label, setFrame: row_frame];

    let font_size = (tile_size.height * 0.15).clamp(17.0, 20.0);
    let font: Id = msg_send![class!(NSFont), systemFontOfSize: font_size];
    let _: () = msg_send![label, setFont: font];

    let arrow_label = find_or_create_label(content_view, arrow_tag, false);
    let arrow_value = NSString::from_str(arrow);
    let _: () = msg_send![arrow_label, setStringValue: &*arrow_value];
    let arrow_frame = NSRect::new(
        NSPoint::new(row_x + row_width * 0.035, row_y),
        NSSize::new(row_width * 0.2, row_height),
    );
    let _: () = msg_send![arrow_label, setFrame: arrow_frame];
    let _: () = msg_send![arrow_label, setFont: font];

    let arrow_color: Id = if is_download {
        msg_send![class!(NSColor), systemRedColor]
    } else {
        msg_send![class!(NSColor), systemGreenColor]
    };
    let _: () = msg_send![arrow_label, setTextColor: arrow_color];
}

unsafe fn find_or_create_label(content_view: Id, tag: isize, background: bool) -> Id {
    let existing: Id = msg_send![content_view, viewWithTag: tag];
    if existing != NIL {
        return existing;
    }

    let empty = NSString::from_str("");
    let label: Id = msg_send![class!(NSTextField), labelWithString: &*empty];
    let _: () = msg_send![label, setTag: tag];
    let _: () = msg_send![label, setAlignment: 1_isize];

    if background {
        let white: Id = msg_send![class!(NSColor), colorWithWhite: 1.0_f64, alpha: 0.92_f64];
        let black: Id = msg_send![class!(NSColor), blackColor];
        let _: () = msg_send![label, setDrawsBackground: Bool::YES];
        let _: () = msg_send![label, setBackgroundColor: white];
        let _: () = msg_send![label, setTextColor: black];
        let _: () = msg_send![label, setWantsLayer: Bool::YES];
        let layer: Id = msg_send![label, layer];
        if layer != NIL {
            let black_cg_color: Id = msg_send![black, CGColor];
            let _: () = msg_send![layer, setCornerRadius: 5.0_f64];
            let _: () = msg_send![layer, setBorderColor: black_cg_color];
            let _: () = msg_send![layer, setBorderWidth: 1.5_f64];
            let _: () = msg_send![layer, setShadowColor: black_cg_color];
            let _: () = msg_send![layer, setShadowOpacity: 0.55_f32];
            let _: () = msg_send![layer, setShadowOffset: NSSize::new(0.0, -1.5)];
            let _: () = msg_send![layer, setShadowRadius: 1.5_f64];
            let _: () = msg_send![layer, setMasksToBounds: Bool::NO];
        }
    }

    let _: () = msg_send![content_view, addSubview: label];
    label
}

unsafe fn remove_speed_labels(content_view: Id) {
    for tag in [
        DOWNLOAD_LABEL_TAG,
        DOWNLOAD_ARROW_TAG,
        UPLOAD_LABEL_TAG,
        UPLOAD_ARROW_TAG,
    ] {
        let label: Id = msg_send![content_view, viewWithTag: tag];
        if label != NIL {
            let _: () = msg_send![label, removeFromSuperview];
        }
    }
}
