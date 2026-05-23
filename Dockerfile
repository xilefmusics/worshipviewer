FROM rust:1.94.1-slim AS builder

RUN export CARGO_BUILD_JOBS=$(nproc) && \
    rustup target add wasm32-unknown-unknown && \
    apt-get update && \
    apt-get install -y --no-install-recommends pkg-config libssl-dev build-essential ca-certificates curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    corepack enable && corepack prepare pnpm@10.33.0 --activate && \
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh && \
    VENOM_VERSION=1.2.0 && \
    curl -L "https://github.com/ovh/venom/releases/download/v${VENOM_VERSION}/venom.linux-amd64" -o /usr/local/bin/venom && \
    chmod +x /usr/local/bin/venom

WORKDIR /wrk
COPY ./shared ./shared

WORKDIR /wrk
COPY ./backend ./backend
WORKDIR /wrk/backend
ARG GIT_COMMIT_SHA
# Omit `GIT_COMMIT_SHA` from the environment when unset so `option_env!("GIT_COMMIT_SHA")` stays absent (CI passes `--build-arg`).
RUN if [ -n "${GIT_COMMIT_SHA:-}" ]; then export GIT_COMMIT_SHA; else unset GIT_COMMIT_SHA; fi && cargo build --release

WORKDIR /wrk
COPY ./frontend ./frontend
WORKDIR /wrk/frontend
RUN pnpm install --frozen-lockfile && pnpm build

FROM scratch AS tester

# runtime libraries required for backend and Venom
COPY --from=builder /lib/x86_64-linux-gnu/libdl.so.2 /lib/x86_64-linux-gnu/libdl.so.2
COPY --from=builder /lib/x86_64-linux-gnu/libpthread.so.0 /lib/x86_64-linux-gnu/libpthread.so.0
COPY --from=builder /lib/x86_64-linux-gnu/libm.so.6 /lib/x86_64-linux-gnu/libm.so.6
COPY --from=builder /lib/x86_64-linux-gnu/libgcc_s.so.1 /lib/x86_64-linux-gnu/libgcc_s.so.1
COPY --from=builder /lib/x86_64-linux-gnu/librt.so.1 /lib/x86_64-linux-gnu/librt.so.1
COPY --from=builder /lib/x86_64-linux-gnu/libc.so.6 /lib/x86_64-linux-gnu/libc.so.6
COPY --from=builder /lib64/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2
COPY --from=builder /usr/lib/x86_64-linux-gnu/libssl.so.3 /usr/lib/x86_64-linux-gnu/libssl.so.3
COPY --from=builder /usr/lib/x86_64-linux-gnu/libcrypto.so.3 /usr/lib/x86_64-linux-gnu/libcrypto.so.3
COPY --from=builder /usr/lib/x86_64-linux-gnu/libz.so.1 /usr/lib/x86_64-linux-gnu/libz.so.1
COPY --from=builder /usr/lib/x86_64-linux-gnu/libzstd.so.1 /usr/lib/x86_64-linux-gnu/libzstd.so.1
COPY --from=builder /usr/lib/x86_64-linux-gnu/libstdc++.so.6 /usr/lib/x86_64-linux-gnu/libstdc++.so.6
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# shell & utilities to orchestrate tests
COPY --from=builder /bin/sh /bin/sh
COPY --from=builder /bin/sleep /bin/sleep

SHELL ["/bin/sh", "-c"]

COPY --from=builder /usr/local/bin/venom /usr/local/bin/venom
COPY --from=builder /wrk/backend/tests /app/tests
COPY --from=builder /wrk/backend/target/release/backend /app/worshipviewer
COPY --from=builder /wrk/backend/db-migrations /app/db-migrations
COPY --from=builder /wrk/frontend/app/dist/ /app/static

WORKDIR /app

ENV INITIAL_ADMIN_USER_EMAIL="admin@example.com" \
    INITIAL_ADMIN_USER_TEST_SESSION=true

RUN set -eux; \
    ./worshipviewer & \
    backend_pid=$!; \
    trap "kill $backend_pid 2>/dev/null || true" EXIT; \
    sleep 5; \
    /usr/local/bin/venom run /app/tests/*.yml; \
    kill $backend_pid; \
    wait $backend_pid 2>/dev/null || true

FROM scratch

COPY --from=builder /lib/x86_64-linux-gnu/libdl.so.2 /lib/x86_64-linux-gnu/libdl.so.2
COPY --from=builder /lib/x86_64-linux-gnu/libpthread.so.0 /lib/x86_64-linux-gnu/libpthread.so.0
COPY --from=builder /lib/x86_64-linux-gnu/libm.so.6 /lib/x86_64-linux-gnu/libm.so.6
COPY --from=builder /lib/x86_64-linux-gnu/libgcc_s.so.1 /lib/x86_64-linux-gnu/libgcc_s.so.1
COPY --from=builder /lib/x86_64-linux-gnu/librt.so.1 /lib/x86_64-linux-gnu/librt.so.1
COPY --from=builder /lib/x86_64-linux-gnu/libc.so.6 /lib/x86_64-linux-gnu/libc.so.6
COPY --from=builder /lib64/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2
COPY --from=builder /usr/lib/x86_64-linux-gnu/libssl.so.3 /usr/lib/x86_64-linux-gnu/libssl.so.3
COPY --from=builder /usr/lib/x86_64-linux-gnu/libcrypto.so.3 /usr/lib/x86_64-linux-gnu/libcrypto.so.3
COPY --from=builder /usr/lib/x86_64-linux-gnu/libz.so.1 /usr/lib/x86_64-linux-gnu/libz.so.1
COPY --from=builder /usr/lib/x86_64-linux-gnu/libzstd.so.1 /usr/lib/x86_64-linux-gnu/libzstd.so.1
COPY --from=builder /usr/lib/x86_64-linux-gnu/libstdc++.so.6 /usr/lib/x86_64-linux-gnu/libstdc++.so.6
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

COPY --from=tester /app/worshipviewer /app/worshipviewer
COPY --from=builder /wrk/backend/db-migrations/ /app/db-migrations
COPY --from=builder /wrk/frontend/app/dist/ /app/static

EXPOSE 8080
# Cloud Run (and other platforms) set PORT; the process must accept traffic on 0.0.0.0, not
# loopback only, or the platform health check will never see an open port.
ENV HOST=0.0.0.0
WORKDIR /app
ENTRYPOINT ["/app/worshipviewer"]
