use std::path::Path;
use std::sync::Mutex;

use dou_core::{Error, Result};
use rusqlite::{Connection, params};
use serde_json::Value;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS rooms (
    cid TEXT NOT NULL,
    id TEXT NOT NULL,
    body TEXT NOT NULL,
    PRIMARY KEY (cid, id)
);
CREATE TABLE IF NOT EXISTS messages (
    cid TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    chat_no INTEGER NOT NULL,
    body TEXT NOT NULL,
    PRIMARY KEY (cid, channel_id, chat_no)
);
CREATE TABLE IF NOT EXISTS journal (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    body TEXT NOT NULL
);
";

pub struct Store {
    connection: Mutex<Connection>,
}

fn db_error(error: rusqlite::Error) -> Error {
    Error::Storage(error.to_string())
}

fn json_error(error: serde_json::Error) -> Error {
    Error::Storage(error.to_string())
}

impl Store {
    pub fn open(path: &Path) -> Result<Self> {
        Self::from_connection(Connection::open(path).map_err(db_error)?)
    }

    pub fn in_memory() -> Result<Self> {
        Self::from_connection(Connection::open_in_memory().map_err(db_error)?)
    }

    fn from_connection(connection: Connection) -> Result<Self> {
        connection.execute_batch(SCHEMA).map_err(db_error)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    fn with<T>(&self, run: impl FnOnce(&Connection) -> rusqlite::Result<T>) -> Result<T> {
        let guard = self
            .connection
            .lock()
            .map_err(|_| Error::Storage("store lock poisoned".into()))?;
        run(&guard).map_err(db_error)
    }

    pub fn replace_rooms(&self, cid: &str, rooms: &[(String, Value)]) -> Result<()> {
        self.with(|c| {
            let tx = c.unchecked_transaction()?;
            tx.execute("DELETE FROM rooms WHERE cid = ?1", params![cid])?;
            for (id, body) in rooms {
                tx.execute(
                    "INSERT INTO rooms (cid, id, body) VALUES (?1, ?2, ?3)",
                    params![cid, id, body.to_string()],
                )?;
            }
            tx.commit()
        })
    }

    pub fn rooms(&self, cid: &str) -> Result<Vec<Value>> {
        let rows: Vec<String> = self.with(|c| {
            let mut statement =
                c.prepare("SELECT body FROM rooms WHERE cid = ?1 ORDER BY rowid")?;
            statement
                .query_map(params![cid], |row| row.get(0))?
                .collect()
        })?;
        rows.iter()
            .map(|text| serde_json::from_str(text).map_err(json_error))
            .collect()
    }

    pub fn upsert_message(
        &self,
        cid: &str,
        channel_id: &str,
        chat_no: i64,
        body: &Value,
    ) -> Result<()> {
        self.with(|c| {
            c.execute(
                "INSERT INTO messages (cid, channel_id, chat_no, body) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT (cid, channel_id, chat_no) DO UPDATE SET body = excluded.body",
                params![cid, channel_id, chat_no, body.to_string()],
            )
            .map(|_| ())
        })
    }

    pub fn message(&self, cid: &str, channel_id: &str, chat_no: i64) -> Result<Option<Value>> {
        let text: Option<String> = self.with(|c| {
            c.query_row(
                "SELECT body FROM messages WHERE cid = ?1 AND channel_id = ?2 AND chat_no = ?3",
                params![cid, channel_id, chat_no],
                |row| row.get(0),
            )
            .map(Some)
            .or_else(|e| match e {
                rusqlite::Error::QueryReturnedNoRows => Ok(None),
                other => Err(other),
            })
        })?;
        text.map(|t| serde_json::from_str(&t).map_err(json_error))
            .transpose()
    }

    pub fn messages(
        &self,
        cid: &str,
        channel_id: &str,
        before: Option<i64>,
        limit: usize,
    ) -> Result<Vec<Value>> {
        let limit = i64::try_from(limit).unwrap_or(i64::MAX);
        let mut rows: Vec<String> = self.with(|c| {
            let mut statement = c.prepare(
                "SELECT body FROM messages WHERE cid = ?1 AND channel_id = ?2 AND chat_no < ?3
                 ORDER BY chat_no DESC LIMIT ?4",
            )?;
            statement
                .query_map(
                    params![cid, channel_id, before.unwrap_or(i64::MAX), limit],
                    |row| row.get(0),
                )?
                .collect()
        })?;
        rows.reverse();
        rows.iter()
            .map(|text| serde_json::from_str(text).map_err(json_error))
            .collect()
    }

    pub fn search_messages(
        &self,
        cid: &str,
        channel_id: &str,
        keyword: &str,
        since: Option<i64>,
        until: Option<i64>,
        limit: usize,
    ) -> Result<Vec<Value>> {
        let limit = i64::try_from(limit).unwrap_or(i64::MAX);
        let rows: Vec<String> = self.with(|c| {
            let mut statement = c.prepare(
                "SELECT body FROM messages
                 WHERE cid = ?1 AND channel_id = ?2
                   AND instr(lower(coalesce(json_extract(body, '$.content'), '')), lower(?3)) > 0
                   AND coalesce(json_extract(body, '$.createdAt'), 0) >= ?4
                   AND coalesce(json_extract(body, '$.createdAt'), 0) <= ?5
                 ORDER BY chat_no DESC LIMIT ?6",
            )?;
            statement
                .query_map(
                    params![
                        cid,
                        channel_id,
                        keyword,
                        since.unwrap_or(i64::MIN),
                        until.unwrap_or(i64::MAX),
                        limit
                    ],
                    |row| row.get(0),
                )?
                .collect()
        })?;
        rows.iter()
            .map(|text| serde_json::from_str(text).map_err(json_error))
            .collect()
    }

    pub fn journal_append(&self, kind: &str, body: &Value) -> Result<i64> {
        self.with(|c| {
            c.execute(
                "INSERT INTO journal (kind, body) VALUES (?1, ?2)",
                params![kind, body.to_string()],
            )?;
            Ok(c.last_insert_rowid())
        })
    }

    pub fn journal_since(&self, seq: i64, limit: usize) -> Result<Vec<(i64, String, Value)>> {
        let limit = i64::try_from(limit).unwrap_or(i64::MAX);
        let rows: Vec<(i64, String, String)> = self.with(|c| {
            let mut statement = c.prepare(
                "SELECT seq, kind, body FROM journal WHERE seq > ?1 ORDER BY seq LIMIT ?2",
            )?;
            statement
                .query_map(params![seq, limit], |row| {
                    Ok((row.get(0)?, row.get(1)?, row.get(2)?))
                })?
                .collect()
        })?;
        rows.into_iter()
            .map(|(seq, kind, text)| {
                Ok((seq, kind, serde_json::from_str(&text).map_err(json_error)?))
            })
            .collect()
    }

    pub fn journal_last(&self) -> Result<i64> {
        self.with(|c| {
            c.query_row("SELECT COALESCE(MAX(seq), 0) FROM journal", [], |row| {
                row.get(0)
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn search_matches_text_ignoring_case_inside_one_room_and_the_time_window() {
        let store = Store::in_memory().unwrap();
        let rows = [
            ("a", 1, "Hello world", 100),
            ("a", 2, "nothing", 200),
            ("a", 3, "say HELLO again", 300),
            ("b", 1, "hello elsewhere", 100),
        ];
        for (room, no, text, at) in rows {
            store
                .upsert_message(
                    "c",
                    room,
                    no,
                    &json!({ "chatNo": no, "content": text, "createdAt": at }),
                )
                .unwrap();
        }
        let hit = |since, until, limit| -> Vec<i64> {
            store
                .search_messages("c", "a", "hello", since, until, limit)
                .unwrap()
                .iter()
                .map(|m| m["chatNo"].as_i64().unwrap())
                .collect()
        };
        assert_eq!(hit(None, None, 10), [3, 1]);
        assert_eq!(hit(Some(200), None, 10), [3]);
        assert_eq!(hit(None, Some(150), 10), [1]);
        assert_eq!(hit(None, None, 1), [3]);
        assert!(
            store
                .search_messages("c", "a", "100%", None, None, 5)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn messages_come_back_oldest_first_and_an_upsert_replaces_by_chat_no() {
        let store = Store::in_memory().unwrap();
        for no in [3, 1, 2] {
            store
                .upsert_message(
                    "c",
                    "ch",
                    no,
                    &json!({ "chatNo": no, "content": format!("m{no}") }),
                )
                .unwrap();
        }
        store
            .upsert_message("c", "ch", 2, &json!({ "chatNo": 2, "content": "edited" }))
            .unwrap();
        let all = store.messages("c", "ch", None, 10).unwrap();
        let numbers: Vec<i64> = all.iter().map(|m| m["chatNo"].as_i64().unwrap()).collect();
        assert_eq!(numbers, [1, 2, 3]);
        assert_eq!(all[1]["content"], "edited");
        let page = store.messages("c", "ch", Some(3), 1).unwrap();
        assert_eq!(page[0]["chatNo"], 2);
    }

    #[test]
    fn rooms_are_replaced_per_cloud_in_order() {
        let store = Store::in_memory().unwrap();
        store
            .replace_rooms(
                "c1",
                &[
                    ("a".into(), json!({"id":"a"})),
                    ("b".into(), json!({"id":"b"})),
                ],
            )
            .unwrap();
        store
            .replace_rooms("c2", &[("z".into(), json!({"id":"z"}))])
            .unwrap();
        store
            .replace_rooms("c1", &[("b".into(), json!({"id":"b"}))])
            .unwrap();
        assert_eq!(store.rooms("c1").unwrap(), [json!({"id":"b"})]);
        assert_eq!(store.rooms("c2").unwrap().len(), 1);
    }

    #[test]
    fn the_journal_hands_out_increasing_cursors() {
        let store = Store::in_memory().unwrap();
        assert_eq!(store.journal_last().unwrap(), 0);
        let first = store.journal_append("mention", &json!({"n":1})).unwrap();
        let second = store.journal_append("dm", &json!({"n":2})).unwrap();
        assert!(second > first);
        let after_first = store.journal_since(first, 10).unwrap();
        assert_eq!(after_first.len(), 1);
        assert_eq!(after_first[0].1, "dm");
    }
}
