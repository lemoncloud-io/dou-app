mod fcm;
mod input;

use std::path::PathBuf;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use gpui::{
    div, img, prelude::*, px, rgb, size, uniform_list, App, Application, Bounds, Context, Entity,
    KeyBinding, ScrollStrategy, UniformListScrollHandle, Window, WindowBounds, WindowOptions,
};
use input::*;

static ROWS_RENDERED: AtomicUsize = AtomicUsize::new(0);
const ROWS: usize = 10_000;
const EMOJI: [&str; 6] = ["😀", "🇰🇷", "👨‍👩‍👧‍👦", "🎉", "❤️", "🙏🏽"];

struct Chat {
    input: Entity<TextInput>,
    scroll: UniformListScrollHandle,
    image: PathBuf,
}

impl Render for Chat {
    fn render(&mut self, _w: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let image = self.image.clone();
        div()
            .flex()
            .flex_col()
            .size_full()
            .bg(rgb(0xffffff))
            .child(
                uniform_list(
                    "messages",
                    ROWS,
                    cx.processor(move |_this, range, _w, _cx| {
                        let mut items = Vec::new();
                        for ix in range {
                            ROWS_RENDERED.fetch_add(1, Ordering::Relaxed);
                            let row = div().id(ix).px_2().h(px(40.)).flex().items_center().gap_2();
                            let text = format!(
                                "#{ix} 안녕하세요 메시지 {} {}",
                                EMOJI[ix % EMOJI.len()],
                                EMOJI[(ix / 7) % EMOJI.len()]
                            );
                            items.push(if ix % 50 == 0 {
                                row.child(img(image.clone()).size(px(36.))).child(text)
                            } else {
                                row.child(text)
                            });
                        }
                        items
                    }),
                )
                .track_scroll(self.scroll.clone())
                .flex_1(),
            )
            .child(div().h(px(48.)).border_t_1().child(self.input.clone()))
    }
}

fn main() {
    if std::env::args().any(|a| a == "--fcm") {
        fcm::probe();
        return;
    }
    let smoke = std::env::var("SPIKE_SMOKE").is_ok();
    Application::new().run(move |cx: &mut App| {
        let modifier = if cfg!(target_os = "macos") { "cmd" } else { "ctrl" };
        cx.bind_keys([
            KeyBinding::new("backspace", Backspace, None),
            KeyBinding::new("delete", Delete, None),
            KeyBinding::new("left", Left, None),
            KeyBinding::new("right", Right, None),
            KeyBinding::new("shift-left", SelectLeft, None),
            KeyBinding::new("shift-right", SelectRight, None),
            KeyBinding::new(&format!("{modifier}-a"), SelectAll, None),
            KeyBinding::new(&format!("{modifier}-v"), Paste, None),
            KeyBinding::new(&format!("{modifier}-c"), Copy, None),
            KeyBinding::new(&format!("{modifier}-x"), Cut, None),
            KeyBinding::new("home", Home, None),
            KeyBinding::new("end", End, None),
        ]);
        let bounds = Bounds::centered(None, size(px(480.), px(720.)), cx);
        let started = Instant::now();
        let window = cx
            .open_window(
                WindowOptions { window_bounds: Some(WindowBounds::Windowed(bounds)), ..Default::default() },
                |_, cx| {
                    cx.new(|cx| Chat {
                        input: cx.new(|cx| TextInput::new(cx, "Type a message (한글 입력 테스트)")),
                        scroll: UniformListScrollHandle::new(),
                        image: PathBuf::from(concat!(env!("CARGO_MANIFEST_DIR"), "/assets/sample.png")),
                    })
                },
            )
            .unwrap();
        println!("SPIKE window opened in {} ms", started.elapsed().as_millis());
        window
            .update(cx, |chat, w, cx| {
                w.focus(&chat.input.read(cx).focus_handle_pub());
                cx.activate(true);
            })
            .unwrap();
        if smoke {
            let handle = window.update(cx, |chat, _, _| chat.scroll.clone()).unwrap();
            cx.spawn(async move |cx| {
                cx.background_executor().timer(Duration::from_millis(1500)).await;
                let t = Instant::now();
                let mut ix = 0;
                while ix < ROWS {
                    handle.scroll_to_item(ix, ScrollStrategy::Top);
                    window.update(cx, |_, _, cx| cx.notify()).ok();
                    cx.background_executor().timer(Duration::from_millis(5)).await;
                    ix += 250;
                }
                println!(
                    "SPIKE scroll done: 10000 rows traversed in {} ms, {} rows rendered",
                    t.elapsed().as_millis(),
                    ROWS_RENDERED.load(Ordering::Relaxed)
                );
                cx.update(|cx| cx.quit()).ok();
            })
            .detach();
        }
    });
}
