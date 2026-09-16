# Build stage
FROM rust:1.92-slim AS build
WORKDIR /app
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
RUN cargo build --release --locked 2>/dev/null || cargo build --release

# Runtime stage: a single static-ish binary on a slim base.
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/target/release/dedup-service /usr/local/bin/dedup-service
ENV PORT=8080
EXPOSE 8080
CMD ["dedup-service"]
