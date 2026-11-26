use std::time::Duration;

use fcm_push_listener::{Message, MessageStream, new_heartbeat_ack};
use tokio::io::AsyncWriteExt;
use tokio_stream::StreamExt;

pub fn probe() {
    let (Ok(app_id), Ok(project_id), Ok(api_key)) = (
        std::env::var("FCM_APP_ID"),
        std::env::var("FCM_PROJECT_ID"),
        std::env::var("FCM_API_KEY"),
    ) else {
        println!("SPIKE fcm: NEEDS-HUMAN no FCM_APP_ID / FCM_PROJECT_ID / FCM_API_KEY in env, crate linked only");
        return;
    };
    let wait: u64 = std::env::var("FCM_WAIT_SECS").ok().and_then(|v| v.parse().ok()).unwrap_or(120);
    let rt = tokio::runtime::Builder::new_multi_thread().enable_all().build().unwrap();
    rt.block_on(async move {
        let http = reqwest::Client::new();
        let registration = match fcm_push_listener::register(&http, &app_id, &project_id, &api_key, None).await {
            Ok(r) => r,
            Err(e) => {
                println!("SPIKE fcm: FAIL register: {e:?}");
                return;
            }
        };
        println!("SPIKE fcm: registered, token length {}", registration.fcm_token.len());
        if let Ok(path) = std::env::var("FCM_TOKEN_OUT") {
            std::fs::write(path, &registration.fcm_token).ok();
        }
        let session = match registration.gcm.checkin(&http).await {
            Ok(s) => s,
            Err(e) => {
                println!("SPIKE fcm: FAIL checkin: {e:?}");
                return;
            }
        };
        let connection = match session.new_connection(vec![]).await {
            Ok(c) => c,
            Err(e) => {
                println!("SPIKE fcm: FAIL connect: {e:?}");
                return;
            }
        };
        println!("SPIKE fcm: connected, waiting {wait}s for one message");
        let mut stream = MessageStream::wrap(connection, &registration.keys);
        let deadline = tokio::time::sleep(Duration::from_secs(wait));
        tokio::pin!(deadline);
        loop {
            tokio::select! {
                _ = &mut deadline => {
                    println!("SPIKE fcm: no message within {wait}s");
                    return;
                }
                next = stream.next() => match next {
                    Some(Ok(Message::Data(d))) => {
                        println!("SPIKE fcm: PASS received data message, {} bytes", d.body.len());
                        return;
                    }
                    Some(Ok(Message::HeartbeatPing)) => {
                        stream.write_all(&new_heartbeat_ack()).await.ok();
                    }
                    Some(Ok(_)) => {}
                    Some(Err(e)) => {
                        println!("SPIKE fcm: FAIL stream: {e:?}");
                        return;
                    }
                    None => {
                        println!("SPIKE fcm: stream closed");
                        return;
                    }
                }
            }
        }
    });
}
