use std::time::{SystemTime, UNIX_EPOCH};

pub fn iso_utc_millis(at: SystemTime) -> String {
    let millis_total = match at.duration_since(UNIX_EPOCH) {
        Ok(d) => i64::try_from(d.as_millis()).unwrap_or(i64::MAX),
        Err(e) => -i64::try_from(e.duration().as_millis()).unwrap_or(i64::MAX),
    };
    let days = millis_total.div_euclid(86_400_000);
    let in_day = millis_total.rem_euclid(86_400_000);
    let (year, month, day) = civil_from_days(days);
    let hour = in_day / 3_600_000;
    let minute = in_day / 60_000 % 60;
    let second = in_day / 1000 % 60;
    let milli = in_day % 1000;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.{milli:03}Z")
}

pub fn iso_now() -> String {
    iso_utc_millis(SystemTime::now())
}

fn civil_from_days(days: i64) -> (i64, i64, i64) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn formats_the_epoch() {
        assert_eq!(iso_utc_millis(UNIX_EPOCH), "1970-01-01T00:00:00.000Z");
    }

    #[test]
    fn formats_a_known_instant_like_date_to_iso_string() {
        let at = UNIX_EPOCH + Duration::from_millis(1_788_048_000_123);
        assert_eq!(iso_utc_millis(at), "2026-08-30T00:00:00.123Z");
    }

    #[test]
    fn formats_a_leap_day() {
        let at = UNIX_EPOCH + Duration::from_secs(1_709_164_800);
        assert_eq!(iso_utc_millis(at), "2024-02-29T00:00:00.000Z");
    }
}
