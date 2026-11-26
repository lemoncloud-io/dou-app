use std::time::{SystemTime, UNIX_EPOCH};

const DIGITS: &[u8; 36] = b"0123456789abcdefghijklmnopqrstuvwxyz";

pub fn to_base36(mut value: u128) -> String {
    if value == 0 {
        return "0".to_string();
    }
    let mut out = Vec::new();
    while value > 0 {
        out.push(DIGITS[(value % 36) as usize]);
        value /= 36;
    }
    out.reverse();
    String::from_utf8_lossy(&out).into_owned()
}

pub fn build_mid() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis());
    let random = u128::from(uuid::Uuid::new_v4().as_u128() as u64) % 36u128.pow(6);
    format!("m-{}-{:0>6}", to_base36(millis), to_base36(random))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base36_matches_javascript_to_string_36() {
        assert_eq!(to_base36(0), "0");
        assert_eq!(to_base36(35), "z");
        assert_eq!(to_base36(36), "10");
        assert_eq!(to_base36(1_795_681_963_010), "mwxaoe82");
    }

    #[test]
    fn a_mid_has_the_prefix_and_a_six_character_suffix() {
        let mid = build_mid();
        let parts: Vec<&str> = mid.split('-').collect();
        assert_eq!(parts[0], "m");
        assert_eq!(parts[2].len(), 6);
    }
}
