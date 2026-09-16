//! Turn messy free-text fields into comparable keys.
//!
//! Everything here is deliberately conservative: we only strip tokens that
//! carry no information about *which* job this is (seasons, years, the word
//! "intern"), and we keep tokens that distinguish postings (degree level,
//! team names, platforms).

use std::collections::BTreeSet;

/// Company suffixes that never distinguish one employer from another.
const COMPANY_SUFFIXES: &[&str] = &[
    "inc",
    "incorporated",
    "llc",
    "llp",
    "ltd",
    "limited",
    "corp",
    "corporation",
    "co",
    "company",
    "plc",
    "gmbh",
    "sa",
    "ag",
    "nv",
    "pty",
    "holdings",
];

/// Title tokens that describe the posting's season or format, never the job.
const TITLE_NOISE: &[&str] = &[
    "summer",
    "fall",
    "spring",
    "winter",
    "autumn",
    "program",
    "programme",
    "multiple",
    "teams",
    "team",
    "early",
    "careers",
    "career",
];

/// Tokens that say which programme a posting belongs to. An internship and a
/// co-op at the same company are different postings.
const FORMAT_MARKERS: &[&str] = &["intern", "interns", "internship", "internships", "coop"];

/// Tokens that mark a degree level. Two titles that disagree on these are
/// different postings even when everything else matches.
const DEGREE_MARKERS: &[&str] = &[
    "phd",
    "doctorate",
    "doctoral",
    "ms",
    "msc",
    "masters",
    "master",
    "bs",
    "bsc",
    "ba",
    "bachelor",
    "bachelors",
    "undergraduate",
    "undergrad",
    "graduate",
    "mba",
];

/// Lowercase, replace every non-alphanumeric run with a single space, trim.
fn fold(s: &str) -> String {
    let lowered = s.to_ascii_lowercase().replace("co-op", "coop");
    let mut out = String::with_capacity(lowered.len());
    let mut last_space = true;
    for ch in lowered.chars() {
        let ch = ch.to_ascii_lowercase();
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
            last_space = false;
        } else if ch == '\'' || ch == '’' {
            // "master's" -> "masters", not "master s"
            continue;
        } else if !last_space {
            out.push(' ');
            last_space = true;
        }
    }
    out.trim_end().to_string()
}

fn is_year(tok: &str) -> bool {
    tok.len() == 4 && tok.starts_with("20") && tok.chars().all(|c| c.is_ascii_digit())
}

fn is_roman_numeral(tok: &str) -> bool {
    matches!(tok, "i" | "ii" | "iii" | "iv" | "v" | "vi")
}

/// Company key used for blocking. "Guardian Life, Inc." and "guardian life" agree.
pub fn company_key(company: &str) -> String {
    let folded = fold(company);
    let mut toks: Vec<&str> = folded.split(' ').filter(|t| !t.is_empty()).collect();
    if toks.first() == Some(&"the") {
        toks.remove(0);
    }
    while toks.len() > 1 && COMPANY_SUFFIXES.contains(toks.last().unwrap()) {
        toks.pop();
    }
    toks.join(" ")
}

/// Very light stemming so "engineer" / "engineers" / "engineering" agree.
/// Only applied for fuzzy comparison, never for the exact-title tier.
pub fn stem(tok: &str) -> String {
    if tok.len() > 6 && tok.ends_with("ing") {
        return tok[..tok.len() - 3].to_string();
    }
    if tok.len() > 4 && tok.ends_with("s") && !tok.ends_with("ss") {
        return tok[..tok.len() - 1].to_string();
    }
    tok.to_string()
}

/// A title reduced to the tokens that identify the job.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TitleKey {
    /// Ordered tokens with noise removed, not stemmed. Equality here is the
    /// strongest title signal we have.
    pub exact: String,
    /// Stemmed token set for fuzzy comparison.
    pub tokens: BTreeSet<String>,
    /// Degree markers present in the title.
    pub degrees: BTreeSet<String>,
    /// "intern" or "coop" when the title says which.
    pub formats: BTreeSet<String>,
}

pub fn title_key(title: &str) -> TitleKey {
    let folded = fold(title);
    let mut exact: Vec<String> = Vec::new();
    let mut tokens = BTreeSet::new();
    let mut degrees = BTreeSet::new();
    let mut formats = BTreeSet::new();
    for tok in folded.split(' ').filter(|t| !t.is_empty()) {
        if TITLE_NOISE.contains(&tok) || is_year(tok) || is_roman_numeral(tok) {
            continue;
        }
        if FORMAT_MARKERS.contains(&tok) {
            formats.insert(if tok == "coop" {
                "coop".to_string()
            } else {
                "intern".to_string()
            });
            continue;
        }
        if DEGREE_MARKERS.contains(&tok) {
            degrees.insert(canonical_degree(tok));
            continue;
        }
        exact.push(tok.to_string());
        tokens.insert(stem(tok));
    }
    TitleKey {
        exact: exact.join(" "),
        tokens,
        degrees,
        formats,
    }
}

fn canonical_degree(tok: &str) -> String {
    match tok {
        "phd" | "doctorate" | "doctoral" => "phd",
        "ms" | "msc" | "masters" | "master" | "graduate" | "mba" => "ms",
        "bs" | "bsc" | "ba" | "bachelor" | "bachelors" | "undergraduate" | "undergrad" => "bs",
        other => other,
    }
    .to_string()
}

/// Location aliases that the sources use interchangeably.
fn canonical_place(place: &str) -> Option<String> {
    let p = fold(place);
    let p = p.trim();
    if p.is_empty() {
        return None;
    }
    let mapped = match p {
        "nyc" | "new york" | "new york city" | "new york ny" | "new york city ny" | "manhattan" => {
            "new york"
        }
        "sf" | "san francisco" | "san francisco ca" | "south sf" | "south san francisco" => {
            "san francisco"
        }
        "la" | "los angeles" | "los angeles ca" => "los angeles",
        "dc" | "washington dc" | "washington d c" => "washington",
        _ => {
            if p.starts_with("remote") || p.contains(" remote") || p.contains("work from home") {
                "remote"
            } else {
                // Drop a trailing state / country code: "denver co" -> "denver".
                let toks: Vec<&str> = p.split(' ').collect();
                if toks.len() >= 2 && toks.last().is_some_and(|t| t.len() <= 3) {
                    return Some(toks[..toks.len() - 1].join(" "));
                }
                p
            }
        }
    };
    Some(mapped.to_string())
}

/// Split a location string into a set of canonical places.
/// "Holmdel, NJ; NYC; Bethlehem, PA" -> {"holmdel", "new york", "bethlehem"}.
pub fn location_set(location: Option<&str>) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    let Some(loc) = location else { return out };
    for part in loc.split([';', '|', '/']) {
        // Some sources use ", " both inside a place ("Denver, CO") and between
        // places. Treat the comma as intra-place; the state-code trim handles it.
        if let Some(p) = canonical_place(part) {
            out.insert(p);
        }
    }
    out
}

/// Two location sets are compatible when either is unknown or they share a place.
pub fn locations_compatible(a: &BTreeSet<String>, b: &BTreeSet<String>) -> bool {
    a.is_empty() || b.is_empty() || a.intersection(b).next().is_some()
}

/// Query parameters that vary between visits to the same posting.
const URL_JUNK_PARAMS: &[&str] = &[
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "ref",
    "src",
    "source",
    "mobile",
    "needsredirect",
    "hub",
    "icims",
    "gh_src",
    "lever-source",
];

/// Canonical form of a posting URL: no scheme, no `www.`, no tracking params,
/// no trailing slash.
pub fn url_key(url: Option<&str>) -> Option<String> {
    let url = url?.trim();
    if url.is_empty() {
        return None;
    }
    let no_scheme = url.split("://").nth(1).unwrap_or(url);
    let no_fragment = no_scheme.split('#').next().unwrap_or(no_scheme);
    let (path, query) = match no_fragment.split_once('?') {
        Some((p, q)) => (p, Some(q)),
        None => (no_fragment, None),
    };
    let mut path = path.to_ascii_lowercase();
    if let Some(stripped) = path.strip_prefix("www.") {
        path = stripped.to_string();
    }
    while path.ends_with('/') {
        path.pop();
    }
    let mut kept: Vec<String> = query
        .into_iter()
        .flat_map(|q| q.split('&'))
        .filter(|kv| !kv.is_empty())
        .filter(|kv| {
            let key = kv.split('=').next().unwrap_or("").to_ascii_lowercase();
            !URL_JUNK_PARAMS.contains(&key.as_str())
        })
        .map(|kv| kv.to_string())
        .collect();
    kept.sort();
    Some(if kept.is_empty() {
        path
    } else {
        format!("{path}?{}", kept.join("&"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn company_suffixes_are_stripped() {
        assert_eq!(company_key("Guardian Life, Inc."), "guardian life");
        assert_eq!(company_key("guardian life"), "guardian life");
        assert_eq!(company_key("The Friedkin Group"), "friedkin group");
        assert_eq!(company_key("Veeam Software"), "veeam software");
        assert_eq!(company_key("Johnson & Johnson"), "johnson johnson");
        // A company whose whole name is a suffix word keeps it.
        assert_eq!(company_key("Co"), "co");
    }

    #[test]
    fn title_noise_is_removed_but_meaning_kept() {
        let k = title_key("Data Services Intern - Summer 2027");
        assert_eq!(k.exact, "data services");
        let k = title_key("Technology Intern - Multiple Teams");
        assert_eq!(k.exact, "technology");
        let k = title_key("Software Engineer Co-op - Summer/Fall 2027");
        assert_eq!(k.exact, "software engineer");
        assert!(k.formats.contains("coop"));
        assert!(title_key("Business Intelligence Co-op")
            .formats
            .contains("coop"));
        assert!(title_key("Data Engineer Intern").formats.contains("intern"));
        assert!(title_key("Applied AI Architect").formats.is_empty());
        let k = title_key("Mobile Software Engineer Intern - iOS");
        assert_eq!(k.exact, "mobile software engineer ios");
    }

    #[test]
    fn degree_markers_are_separated_out() {
        let k = title_key("User Experience Engineer Intern - PhD - Summer 2027");
        assert_eq!(k.exact, "user experience engineer");
        assert!(k.degrees.contains("phd"));
        let k = title_key("Backend Software Engineer Intern - Java & AI - Master's");
        assert!(k.degrees.contains("ms"));
        let k = title_key("Software Engineer Intern - BS/MS");
        assert_eq!(k.degrees.len(), 2);
    }

    #[test]
    fn stemming_unifies_engineer_and_engineering() {
        assert_eq!(stem("engineering"), "engineer");
        assert_eq!(stem("engineers"), "engineer");
        assert_eq!(stem("analytics"), "analytic");
        assert_eq!(stem("data"), "data");
        assert_eq!(stem("ios"), "ios");
    }

    #[test]
    fn locations_are_canonical_sets() {
        let a = location_set(Some("Holmdel, NJ; NYC; Bethlehem, PA"));
        assert!(a.contains("new york"));
        assert!(a.contains("holmdel"));
        let b = location_set(Some("New York City, NY"));
        assert!(locations_compatible(&a, &b));
        let sf = location_set(Some("SF"));
        let sf2 = location_set(Some("San Francisco, CA"));
        assert!(locations_compatible(&sf, &sf2));
        assert!(!locations_compatible(&sf, &b));
        let remote = location_set(Some("Remote in USA"));
        assert!(remote.contains("remote"));
        assert!(locations_compatible(&location_set(None), &b));
    }

    #[test]
    fn url_key_ignores_tracking_noise() {
        let a = url_key(Some(
            "https://www.equipmentshare.com/careers/openings/?gh_jid=8188474&utm_source=simplify",
        ));
        let b = url_key(Some(
            "http://equipmentshare.com/careers/openings?gh_jid=8188474",
        ));
        assert_eq!(a, b);
        let c = url_key(Some(
            "https://www.equipmentshare.com/careers/openings/?gh_jid=8188802",
        ));
        assert_ne!(a, c);
        assert_eq!(url_key(Some("  ")), None);
    }
}
