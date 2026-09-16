//! Runs the matcher over a snapshot of the real `roles` table (168 rows,
//! 2026-09-16) and pins the decisions we reviewed by hand.

use dedup::{dedup, Config, Role};
use std::collections::HashMap;

fn load() -> Vec<Role> {
    let text = include_str!("fixtures/roles-2026-09-16.json");
    serde_json::from_str(text).expect("fixture parses")
}

fn by_title<'a>(roles: &'a [Role], company: &str, title: &str) -> Vec<&'a Role> {
    roles
        .iter()
        .filter(|r| r.company == company && r.title == title)
        .collect()
}

#[test]
fn snapshot_groups_are_the_reviewed_ones() {
    let roles = load();
    let out = dedup(&roles, &Config::default());
    let group_of: HashMap<&str, Option<&str>> = out
        .assignments
        .iter()
        .map(|a| (a.id.as_str(), a.dedup_group.as_deref()))
        .collect();
    let same = |a: &Role, b: &Role| {
        group_of[a.id.as_str()].is_some() && group_of[a.id.as_str()] == group_of[b.id.as_str()]
    };

    // Merged: identical title, one site, three req ids.
    let gdit = by_title(
        &roles,
        "General Dynamics Information Technology",
        "Software Development Intern",
    );
    assert_eq!(gdit.len(), 3);
    assert!(same(gdit[0], gdit[1]) && same(gdit[1], gdit[2]));

    // Merged: same title in two cities.
    let lyft = by_title(&roles, "Lyft", "Data Science Intern - Algorithms");
    assert_eq!(lyft.len(), 2);
    assert!(same(lyft[0], lyft[1]));

    // Merged: EquipmentShare and CAI repeat a title at one site.
    let es = by_title(&roles, "EquipmentShare", "Software Engineer Intern");
    assert_eq!(es.len(), 3);
    assert!(same(es[0], es[2]));
    let cai = by_title(&roles, "CAI", "Software Developer Intern");
    assert!(same(cai[0], cai[1]));

    // Merged: OpenGov, same title in Boston and Atlanta.
    let og = by_title(&roles, "OpenGov", "Software Engineer Intern");
    assert_eq!(og.len(), 2);
    assert!(same(og[0], og[1]));

    // Merged: CoStar suffix variants.
    let costar: Vec<&Role> = roles
        .iter()
        .filter(|r| r.company == "CoStar Group")
        .collect();
    assert_eq!(costar.len(), 3);
    assert!(same(costar[0], costar[1]) && same(costar[1], costar[2]));

    // Kept apart: degree levels, platforms, qualifiers, disjoint-location fuzzy matches.
    let g_phd = by_title(
        &roles,
        "Google",
        "User Experience Engineer Intern - PhD - Summer 2027",
    )[0];
    let g_ux = by_title(&roles, "Google", "User Experience Engineer Intern")[0];
    assert!(!same(g_phd, g_ux));
    let ios = by_title(&roles, "Intuit", "Mobile Software Engineer Intern - iOS")[0];
    let android = by_title(
        &roles,
        "Intuit",
        "Mobile Software Engineer Intern - Android",
    )[0];
    assert!(!same(ios, android));
    let lowes: Vec<&Role> = roles.iter().filter(|r| r.company == "Lowe's").collect();
    assert!(!same(lowes[0], lowes[1]));
    let wf: Vec<&Role> = roles
        .iter()
        .filter(|r| r.company == "Wells Fargo")
        .collect();
    assert!(!same(wf[0], wf[1]));
    let rtx: Vec<&Role> = roles.iter().filter(|r| r.company == "RTX").collect();
    assert!(
        !same(rtx[0], rtx[1]),
        "co-op and internship are different programmes"
    );
    let waymo: Vec<&Role> = roles.iter().filter(|r| r.company == "Waymo").collect();
    for a in &waymo {
        for b in &waymo {
            assert!(a.id == b.id || !same(a, b));
        }
    }

    // Nothing crosses a company boundary, and the total is what we reviewed.
    for g in &out.groups {
        let companies: std::collections::BTreeSet<String> = g
            .member_ids
            .iter()
            .map(|id| {
                dedup::normalize::company_key(&roles.iter().find(|r| &r.id == id).unwrap().company)
            })
            .collect();
        assert_eq!(
            companies.len(),
            1,
            "group {} spans companies {:?}",
            g.dedup_group,
            companies
        );
    }
    assert_eq!(out.stats.roles, 168);
    assert_eq!(out.stats.groups, 6, "{:#?}", out.groups);
    assert_eq!(out.stats.duplicates, 9);
    assert!(
        out.stats.comparisons < 200,
        "blocking keeps this far below n²: {}",
        out.stats.comparisons
    );
}

#[test]
fn output_is_deterministic_under_shuffle() {
    let mut roles = load();
    let a = dedup(&roles, &Config::default());
    roles.reverse();
    let b = dedup(&roles, &Config::default());
    assert_eq!(a.groups, b.groups);
    let mut aa = a.assignments.clone();
    let mut bb = b.assignments.clone();
    aa.sort_by(|x, y| x.id.cmp(&y.id));
    bb.sort_by(|x, y| x.id.cmp(&y.id));
    assert_eq!(aa, bb);
}
