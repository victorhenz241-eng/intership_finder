//! Fuzzy record linkage for internship postings.
//!
//! Pipeline: normalize → block on company → pairwise compare within a block →
//! union-find into groups → pick one primary per group.
//!
//! The matching is deliberately asymmetric. A missed merge costs the user one
//! extra glance; a wrong merge tucks a real job behind another one. So every
//! rule below errs toward keeping rows separate.

pub mod normalize;
pub mod similarity;
pub mod unionfind;

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::time::Instant;

use normalize::{company_key, location_set, locations_compatible, title_key, url_key, TitleKey};
use similarity::{jaccard, jaro_winkler};
use unionfind::UnionFind;

/// The subset of a `roles` row the matcher needs. Every field except `id`,
/// `company` and `title` is optional so partial rows still work.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Role {
    pub id: String,
    pub company: String,
    pub title: String,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub stage: Option<String>,
    #[serde(default)]
    pub fit_score: Option<i64>,
    #[serde(default)]
    pub why: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub first_seen: Option<String>,
}

/// Tunable thresholds. The defaults are the conservative ones.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct Config {
    /// Minimum Jaccard similarity of stemmed title tokens for a fuzzy match.
    pub title_jaccard_min: f64,
    /// Minimum Jaro-Winkler similarity of the normalized title strings for a fuzzy match.
    pub title_jaro_winkler_min: f64,
    /// Fuzzy matches also need a shared location (or one side unknown).
    pub fuzzy_requires_location: bool,
    /// Identical normalized titles match even when the locations are disjoint
    /// (one internship posted in two cities).
    pub exact_title_ignores_location: bool,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            title_jaccard_min: 0.8,
            title_jaro_winkler_min: 0.92,
            fuzzy_requires_location: true,
            exact_title_ignores_location: true,
        }
    }
}

/// Why two rows were linked.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MatchKind {
    /// Same canonical posting URL.
    SameUrl,
    /// Same company and identical normalized title.
    ExactTitle,
    /// Same company, similar title, compatible location.
    FuzzyTitle,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Evidence {
    pub a: String,
    pub b: String,
    pub kind: MatchKind,
    /// Title similarity in [0, 1]; 1.0 for URL and exact matches.
    pub score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Group {
    /// Stable id: the lexicographically smallest member id.
    pub dedup_group: String,
    pub primary_id: String,
    pub member_ids: Vec<String>,
    pub evidence: Vec<Evidence>,
}

/// One row per input role, ready to write back.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Assignment {
    pub id: String,
    /// `None` for rows that matched nothing.
    pub dedup_group: Option<String>,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Stats {
    pub roles: usize,
    pub blocks: usize,
    pub comparisons: usize,
    pub groups: usize,
    /// Rows that are hidden behind a primary.
    pub duplicates: usize,
    pub elapsed_ms: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Output {
    pub groups: Vec<Group>,
    pub assignments: Vec<Assignment>,
    pub stats: Stats,
}

struct Prepared {
    company: String,
    title: TitleKey,
    places: BTreeSet<String>,
    url: Option<String>,
}

fn prepare(r: &Role) -> Prepared {
    Prepared {
        company: company_key(&r.company),
        title: title_key(&r.title),
        places: location_set(r.location.as_deref()),
        url: url_key(r.url.as_deref()),
    }
}

/// Decide whether two rows in the same company block describe one job.
fn compare(a: &Prepared, b: &Prepared, cfg: &Config) -> Option<(MatchKind, f64)> {
    if let (Some(ua), Some(ub)) = (&a.url, &b.url) {
        if ua == ub {
            return Some((MatchKind::SameUrl, 1.0));
        }
    }
    // Different degree levels are different postings, full stop.
    if !a.title.degrees.is_empty()
        && !b.title.degrees.is_empty()
        && a.title.degrees != b.title.degrees
    {
        return None;
    }
    if a.title.degrees.len() != b.title.degrees.len() {
        return None;
    }
    // An internship and a co-op are different programmes.
    if !a.title.formats.is_empty()
        && !b.title.formats.is_empty()
        && a.title.formats != b.title.formats
    {
        return None;
    }
    if a.title.exact.is_empty() || b.title.exact.is_empty() {
        return None;
    }
    if a.title.exact == b.title.exact {
        if cfg.exact_title_ignores_location || locations_compatible(&a.places, &b.places) {
            return Some((MatchKind::ExactTitle, 1.0));
        }
        return None;
    }
    let jac = jaccard(&a.title.tokens, &b.title.tokens);
    let jw = jaro_winkler(&a.title.exact, &b.title.exact);
    if jac >= cfg.title_jaccard_min
        && jw >= cfg.title_jaro_winkler_min
        && (!cfg.fuzzy_requires_location || locations_compatible(&a.places, &b.places))
    {
        return Some((MatchKind::FuzzyTitle, jac.min(jw)));
    }
    None
}

fn stage_rank(stage: Option<&str>) -> u8 {
    match stage.unwrap_or("found") {
        "interested" | "applied" | "replied" | "interview" | "offer" | "closed" => 0,
        "dismissed" => 1,
        _ => 2,
    }
}

fn is_unscored(r: &Role) -> bool {
    r.fit_score.unwrap_or(0) == 0 && r.why.as_deref().is_none_or(|w| w.trim().is_empty())
}

/// Ordering key for choosing the primary. Lower sorts first.
/// A row the user already acted on must never be hidden behind one they haven't.
fn primary_key(r: &Role) -> (u8, u8, i64, u8, u8, i64, String, String) {
    (
        stage_rank(r.stage.as_deref()),
        if is_unscored(r) { 1 } else { 0 },
        -r.fit_score.unwrap_or(0),
        if r.url.is_some() { 0 } else { 1 },
        if r.why.as_deref().is_none_or(str::is_empty) {
            1
        } else {
            0
        },
        -(r.description.as_deref().map_or(0, str::len) as i64),
        r.first_seen.clone().unwrap_or_default(),
        r.id.clone(),
    )
}

/// Group `roles` into real-world jobs.
pub fn dedup(roles: &[Role], cfg: &Config) -> Output {
    let start = Instant::now();
    let prepared: Vec<Prepared> = roles.iter().map(prepare).collect();

    // Block on company key. Rows whose company normalizes to nothing are
    // never compared with anything.
    let mut blocks: BTreeMap<&str, Vec<usize>> = BTreeMap::new();
    for (i, p) in prepared.iter().enumerate() {
        if !p.company.is_empty() {
            blocks.entry(p.company.as_str()).or_default().push(i);
        }
    }

    let mut uf = UnionFind::new(roles.len());
    let mut evidence: Vec<Evidence> = Vec::new();
    let mut comparisons = 0usize;
    for members in blocks.values() {
        for x in 0..members.len() {
            for y in (x + 1)..members.len() {
                let (i, j) = (members[x], members[y]);
                comparisons += 1;
                if let Some((kind, score)) = compare(&prepared[i], &prepared[j], cfg) {
                    uf.union(i, j);
                    let (a, b) = if roles[i].id <= roles[j].id {
                        (i, j)
                    } else {
                        (j, i)
                    };
                    evidence.push(Evidence {
                        a: roles[a].id.clone(),
                        b: roles[b].id.clone(),
                        kind,
                        score,
                    });
                }
            }
        }
    }

    // Collect components with two or more members.
    let mut components: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
    for i in 0..roles.len() {
        let root = uf.find(i);
        components.entry(root).or_default().push(i);
    }

    let mut groups: Vec<Group> = Vec::new();
    let mut assignment_of: BTreeMap<usize, (String, bool)> = BTreeMap::new();
    for members in components.values() {
        if members.len() < 2 {
            continue;
        }
        let mut ids: Vec<&Role> = members.iter().map(|&i| &roles[i]).collect();
        ids.sort_by_key(|r| primary_key(r));
        let primary = ids[0].id.clone();
        let group_id = members
            .iter()
            .map(|&i| roles[i].id.as_str())
            .min()
            .unwrap()
            .to_string();
        let member_set: BTreeSet<&str> = members.iter().map(|&i| roles[i].id.as_str()).collect();
        let mut member_ids: Vec<String> = member_set.iter().map(|s| s.to_string()).collect();
        member_ids.sort();
        for &i in members {
            assignment_of.insert(i, (group_id.clone(), roles[i].id == primary));
        }
        let mut group_evidence: Vec<Evidence> = evidence
            .iter()
            .filter(|e| member_set.contains(e.a.as_str()))
            .cloned()
            .collect();
        group_evidence.sort_by(|x, y| (&x.a, &x.b).cmp(&(&y.a, &y.b)));
        groups.push(Group {
            dedup_group: group_id,
            primary_id: primary,
            member_ids,
            evidence: group_evidence,
        });
    }
    groups.sort_by(|a, b| a.dedup_group.cmp(&b.dedup_group));

    let assignments: Vec<Assignment> = roles
        .iter()
        .enumerate()
        .map(|(i, r)| match assignment_of.get(&i) {
            Some((g, primary)) => Assignment {
                id: r.id.clone(),
                dedup_group: Some(g.clone()),
                is_primary: *primary,
            },
            None => Assignment {
                id: r.id.clone(),
                dedup_group: None,
                is_primary: true,
            },
        })
        .collect();

    let duplicates = assignments.iter().filter(|a| !a.is_primary).count();
    Output {
        stats: Stats {
            roles: roles.len(),
            blocks: blocks.len(),
            comparisons,
            groups: groups.len(),
            duplicates,
            elapsed_ms: start.elapsed().as_secs_f64() * 1000.0,
        },
        groups,
        assignments,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn role(id: &str, company: &str, title: &str, location: &str) -> Role {
        Role {
            id: id.into(),
            company: company.into(),
            title: title.into(),
            location: Some(location.into()),
            url: None,
            source: None,
            stage: None,
            fit_score: Some(50),
            why: Some("scored".into()),
            description: None,
            first_seen: None,
        }
    }

    fn groups_of(roles: &[Role]) -> Vec<Vec<String>> {
        dedup(roles, &Config::default())
            .groups
            .into_iter()
            .map(|g| g.member_ids)
            .collect()
    }

    #[test]
    fn identical_postings_at_one_site_merge() {
        // General Dynamics lists "Software Development Intern" at Falls Church three times.
        let rs = vec![
            role(
                "a",
                "General Dynamics Information Technology",
                "Software Development Intern",
                "Falls Church, VA",
            ),
            role(
                "b",
                "General Dynamics Information Technology",
                "Software Development Intern",
                "Falls Church, VA",
            ),
            role(
                "c",
                "General Dynamics Information Technology",
                "Software Development Intern",
                "Falls Church, VA",
            ),
        ];
        assert_eq!(groups_of(&rs), vec![vec!["a", "b", "c"]]);
    }

    #[test]
    fn same_title_two_cities_is_one_job() {
        // Lyft: "Data Science Intern - Algorithms" in SF and in NYC.
        let rs = vec![
            role("a", "Lyft", "Data Science Intern - Algorithms", "SF"),
            role("b", "Lyft", "Data Science Intern - Algorithms", "NYC"),
            role("c", "Lyft", "Data Analyst Intern", "NYC"),
        ];
        assert_eq!(groups_of(&rs), vec![vec!["a", "b"]]);
    }

    #[test]
    fn suffix_only_variants_merge() {
        // CoStar: "Technology Intern", "- Multiple Teams", "- Summer 2027".
        let rs = vec![
            role("a", "CoStar Group", "Technology Intern", "Arlington, VA"),
            role(
                "b",
                "CoStar Group",
                "Technology Intern - Multiple Teams",
                "Nashville, TN",
            ),
            role(
                "c",
                "CoStar Group",
                "Technology Intern - Summer 2027",
                "Richmond, VA",
            ),
        ];
        assert_eq!(groups_of(&rs), vec![vec!["a", "b", "c"]]);
    }

    #[test]
    fn different_degree_levels_stay_separate() {
        // Google: UX Engineer Intern with and without "PhD".
        let rs = vec![
            role(
                "a",
                "Google",
                "User Experience Engineer Intern - PhD - Summer 2027",
                "Mountain View, CA",
            ),
            role(
                "b",
                "Google",
                "User Experience Engineer Intern",
                "Mountain View, CA",
            ),
        ];
        assert!(groups_of(&rs).is_empty());
        // Wex: Master's vs Undergraduate variants of otherwise similar titles.
        let rs = vec![
            role(
                "a",
                "Wex",
                "Backend Software Engineer Intern - Java & AI - Master's",
                "Remote in USA",
            ),
            role(
                "b",
                "Wex",
                "Backend Software Engineer Intern - Java & AI - Undergraduate",
                "Remote in USA",
            ),
        ];
        assert!(groups_of(&rs).is_empty());
    }

    #[test]
    fn coop_and_internship_are_different_programmes() {
        // RTX: "Software Engineer Co-op - Summer/Fall 2027" vs "Software Engineer Intern".
        let rs = vec![
            role(
                "a",
                "RTX",
                "Software Engineer Co-op - Summer/Fall 2027",
                "Wilsonville, OR",
            ),
            role("b", "RTX", "Software Engineer Intern", "State College, PA"),
        ];
        assert!(groups_of(&rs).is_empty());
    }

    #[test]
    fn platform_variants_stay_separate() {
        // Intuit / Robinhood: iOS vs Android vs Backend vs Web.
        let rs = vec![
            role(
                "a",
                "Intuit",
                "Mobile Software Engineer Intern - iOS",
                "Mountain View, CA",
            ),
            role(
                "b",
                "Intuit",
                "Mobile Software Engineer Intern - Android",
                "Mountain View, CA",
            ),
            role(
                "c",
                "Robinhood",
                "Software Engineer Intern - Backend",
                "Menlo Park, CA",
            ),
            role(
                "d",
                "Robinhood",
                "Software Engineer Intern - Web",
                "Menlo Park, CA",
            ),
        ];
        assert!(groups_of(&rs).is_empty());
    }

    #[test]
    fn a_qualifier_word_keeps_titles_apart() {
        // Lowe's: "Exploratory Software Engineer Intern" vs "Software Engineer Intern".
        // Jaccard 3/4 is below the 0.8 bar: conservative, stays separate.
        let rs = vec![
            role(
                "a",
                "Lowe's",
                "Exploratory Software Engineer Intern",
                "Charlotte, NC",
            ),
            role("b", "Lowe's", "Software Engineer Intern", "Charlotte, NC"),
        ];
        assert!(groups_of(&rs).is_empty());
        // "Data Science Intern" vs "Data Science Intern - Algorithms": can't tell, keep apart.
        let rs = vec![
            role("a", "Acme", "Data Science Intern", "NYC"),
            role("b", "Acme", "Data Science Intern - Algorithms", "NYC"),
        ];
        assert!(groups_of(&rs).is_empty());
    }

    #[test]
    fn engineer_vs_engineering_needs_a_shared_location() {
        // Wells Fargo: "Software Engineer Intern - Early Careers" on the east coast
        // vs "Software Engineering Intern - Early Careers" in California.
        let east = "Iselin, Woodbridge Township, NJ; Charlotte, NC; St. Louis, MO";
        let west = "Concord, CA; SF; San Leandro, CA";
        let rs = vec![
            role(
                "a",
                "Wells Fargo",
                "Software Engineer Intern - Early Careers - Software Engineering",
                east,
            ),
            role(
                "b",
                "Wells Fargo",
                "Software Engineering Intern - Early Careers - Software Engineering",
                west,
            ),
        ];
        assert!(
            groups_of(&rs).is_empty(),
            "disjoint locations block a fuzzy match"
        );
        let rs = vec![
            role(
                "a",
                "Wells Fargo",
                "Software Engineer Intern - AI & Cloud",
                "Charlotte, NC; SF",
            ),
            role(
                "b",
                "Wells Fargo",
                "Software Engineering Intern - AI & Cloud",
                "SF",
            ),
        ];
        assert_eq!(groups_of(&rs), vec![vec!["a", "b"]], "shared SF allows it");
    }

    #[test]
    fn company_variants_land_in_one_block() {
        let rs = vec![
            role(
                "a",
                "Guardian Life, Inc.",
                "Data Engineering Intern - Digital & Technology",
                "NYC",
            ),
            role(
                "b",
                "guardian life",
                "Data Engineering Intern - Digital & Technology",
                "New York City, NY",
            ),
            role(
                "c",
                "Guardian Life Insurance",
                "Data Engineering Intern - Digital & Technology",
                "NYC",
            ),
        ];
        // "Guardian Life Insurance" is a different key: strict blocking keeps it out.
        assert_eq!(groups_of(&rs), vec![vec!["a", "b"]]);
    }

    #[test]
    fn same_url_from_two_sources_merges_regardless_of_title() {
        let mut a = role("a", "Anthropic", "AI Ops Engineer", "SF");
        a.url = Some(
            "https://job-boards.greenhouse.io/anthropic/jobs/5391151008?gh_src=simplify".into(),
        );
        a.source = Some("simplify".into());
        let mut b = role(
            "b",
            "Anthropic",
            "AI Operations Engineer, Partnerships",
            "San Francisco, CA",
        );
        b.url = Some("https://job-boards.greenhouse.io/anthropic/jobs/5391151008".into());
        b.source = Some("greenhouse".into());
        let out = dedup(&[a, b], &Config::default());
        assert_eq!(out.groups.len(), 1);
        assert_eq!(out.groups[0].evidence[0].kind, MatchKind::SameUrl);
    }

    #[test]
    fn primary_prefers_the_row_the_user_acted_on() {
        let mut a = role("a", "Lyft", "Data Science Intern - Algorithms", "SF");
        a.fit_score = Some(85);
        let mut b = role("b", "Lyft", "Data Science Intern - Algorithms", "NYC");
        b.fit_score = Some(78);
        b.stage = Some("applied".into());
        let out = dedup(&[a.clone(), b.clone()], &Config::default());
        assert_eq!(
            out.groups[0].primary_id, "b",
            "applied beats a higher score"
        );
        b.stage = None;
        let out = dedup(&[a, b], &Config::default());
        assert_eq!(
            out.groups[0].primary_id, "a",
            "otherwise the higher score wins"
        );
    }

    #[test]
    fn primary_prefers_scored_over_unscored() {
        let a = role("a", "CAI", "Software Developer Intern", "Pennsylvania");
        let mut b = role("b", "CAI", "Software Developer Intern", "Pennsylvania");
        b.fit_score = Some(0);
        b.why = Some("".into());
        let out = dedup(&[b, a], &Config::default());
        assert_eq!(out.groups[0].primary_id, "a");
    }

    #[test]
    fn group_id_is_stable_and_assignments_cover_every_row() {
        let rs = vec![
            role("z", "Lyft", "Data Science Intern - Algorithms", "SF"),
            role("m", "Lyft", "Data Science Intern - Algorithms", "NYC"),
            role("q", "Other", "Solo Intern", "Nowhere"),
        ];
        let out = dedup(&rs, &Config::default());
        assert_eq!(out.groups[0].dedup_group, "m", "smallest member id");
        assert_eq!(out.assignments.len(), 3);
        let solo = out.assignments.iter().find(|a| a.id == "q").unwrap();
        assert_eq!(solo.dedup_group, None);
        assert!(solo.is_primary);
        assert_eq!(out.assignments.iter().filter(|a| !a.is_primary).count(), 1);
        assert_eq!(out.stats.duplicates, 1);
        assert_eq!(
            out.stats.comparisons, 1,
            "blocking avoids the cross-company pairs"
        );
    }

    #[test]
    fn empty_input_is_fine() {
        let out = dedup(&[], &Config::default());
        assert!(out.groups.is_empty());
        assert!(out.assignments.is_empty());
    }
}
