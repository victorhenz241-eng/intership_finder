//! String similarity measures. Both are implemented here rather than pulled
//! from a crate so the behaviour is fully known and the service has no
//! surprise dependencies.

use std::collections::BTreeSet;

/// Jaccard similarity of two token sets: |A ∩ B| / |A ∪ B|. Empty sets score 0.
pub fn jaccard(a: &BTreeSet<String>, b: &BTreeSet<String>) -> f64 {
    if a.is_empty() && b.is_empty() {
        return 0.0;
    }
    let inter = a.intersection(b).count() as f64;
    let union = a.union(b).count() as f64;
    inter / union
}

/// Jaro similarity on characters. 1.0 for identical strings, 0.0 for nothing in common.
pub fn jaro(a: &str, b: &str) -> f64 {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let window = (a.len().max(b.len()) / 2).saturating_sub(1);
    let mut a_matched = vec![false; a.len()];
    let mut b_matched = vec![false; b.len()];
    let mut matches = 0usize;
    for (i, &ca) in a.iter().enumerate() {
        let lo = i.saturating_sub(window);
        let hi = (i + window + 1).min(b.len());
        for j in lo..hi {
            if !b_matched[j] && b[j] == ca {
                a_matched[i] = true;
                b_matched[j] = true;
                matches += 1;
                break;
            }
        }
    }
    if matches == 0 {
        return 0.0;
    }
    let mut transpositions = 0usize;
    let mut k = 0usize;
    for (i, &ca) in a.iter().enumerate() {
        if !a_matched[i] {
            continue;
        }
        while !b_matched[k] {
            k += 1;
        }
        if ca != b[k] {
            transpositions += 1;
        }
        k += 1;
    }
    let m = matches as f64;
    (m / a.len() as f64 + m / b.len() as f64 + (m - transpositions as f64 / 2.0) / m) / 3.0
}

/// Jaro-Winkler: Jaro boosted for a shared prefix of up to four characters.
pub fn jaro_winkler(a: &str, b: &str) -> f64 {
    let j = jaro(a, b);
    let prefix = a
        .chars()
        .zip(b.chars())
        .take(4)
        .take_while(|(x, y)| x == y)
        .count();
    j + prefix as f64 * 0.1 * (1.0 - j)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set(words: &[&str]) -> BTreeSet<String> {
        words.iter().map(|w| w.to_string()).collect()
    }

    #[test]
    fn jaccard_basics() {
        assert_eq!(jaccard(&set(&["a", "b"]), &set(&["a", "b"])), 1.0);
        assert_eq!(jaccard(&set(&["a", "b"]), &set(&["c"])), 0.0);
        assert!(
            (jaccard(
                &set(&["data", "science"]),
                &set(&["data", "science", "algorithms"])
            ) - 2.0 / 3.0)
                .abs()
                < 1e-9
        );
        assert_eq!(jaccard(&set(&[]), &set(&[])), 0.0);
    }

    #[test]
    fn jaro_winkler_known_values() {
        assert!((jaro_winkler("martha", "marhta") - 0.9611).abs() < 1e-3);
        assert!((jaro_winkler("dixon", "dicksonx") - 0.8133).abs() < 1e-3);
        assert_eq!(jaro_winkler("same", "same"), 1.0);
        assert_eq!(jaro_winkler("", "abc"), 0.0);
        assert_eq!(jaro_winkler("abc", "xyz"), 0.0);
    }
}
