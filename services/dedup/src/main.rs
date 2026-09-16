//! HTTP wrapper around the dedup library.
//!
//! `POST /dedup` with `{"roles": [...], "config": {...}?}` returns groups,
//! per-row assignments and stats. `GET /health` returns `ok`.
//!
//! Run with a file argument to dedup a JSON array of roles from disk and print
//! the result instead of serving: `dedup-service roles.json`.

use axum::{
    extract::DefaultBodyLimit,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use dedup::{dedup, Config, Output, Role};
use serde::Deserialize;

#[derive(Deserialize)]
struct Request {
    roles: Vec<Role>,
    #[serde(default)]
    config: Config,
}

async fn handle(Json(req): Json<Request>) -> (StatusCode, Json<Output>) {
    (StatusCode::OK, Json(dedup(&req.roles, &req.config)))
}

async fn health() -> &'static str {
    "ok"
}

#[tokio::main]
async fn main() {
    if let Some(path) = std::env::args().nth(1) {
        let text = std::fs::read_to_string(&path).unwrap_or_else(|e| {
            eprintln!("cannot read {path}: {e}");
            std::process::exit(2);
        });
        let roles: Vec<Role> = serde_json::from_str(&text).unwrap_or_else(|e| {
            eprintln!("{path} is not a JSON array of roles: {e}");
            std::process::exit(2);
        });
        let out = dedup(&roles, &Config::default());
        println!("{}", serde_json::to_string_pretty(&out).unwrap());
        return;
    }

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);
    let app = Router::new()
        .route("/health", get(health))
        .route("/dedup", post(handle))
        .layer(DefaultBodyLimit::max(64 * 1024 * 1024));
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .expect("bind");
    eprintln!("dedup-service listening on :{port}");
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .expect("server");
}
