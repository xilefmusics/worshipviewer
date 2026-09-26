FROM rust:1.98.1-slim AS toolchain

RUN export CARGO_BUILD_JOBS=$(nproc) && \
    rustup target add wasm32-unknown-unknown && \
    apt-get update && \
    apt-get install -y --no-install-recommends pkg-config libssl-dev build-essential ca-certificates curl && \
    curl -fsSL https://deb.nodesource.com/setup_26.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    npm install --global pnpm@12.6.0 && \
    curl -fsSL https://rustwasm.github.io/wasm-pack/installer/init.sh | VERSION=0.15.0 sh

FROM toolchain AS backend-builder
WORKDIR /wrk
COPY ./shared ./shared
# Copy build inputs explicitly: local runtime data must not invalidate compilation.
COPY ./backend/Cargo.toml ./backend/Cargo.lock ./backend/openapi.json ./backend/
COPY ./backend/.cargo ./backend/.cargo
COPY ./backend/src ./backend/src
COPY ./backend/db-migrations ./backend/db-migrations
COPY ./backend/examples ./backend/examples
COPY ./backend/static ./backend/static
COPY ./backend/tests ./backend/tests
WORKDIR /wrk/backend
ARG GIT_COMMIT_SHA
# Omit `GIT_COMMIT_SHA` from the environment when unset so `option_env!("GIT_COMMIT_SHA")` stays absent (CI passes `--build-arg`).
RUN if [ -n "${GIT_COMMIT_SHA:-}" ]; then export GIT_COMMIT_SHA; else unset GIT_COMMIT_SHA; fi && cargo build --release

# Compile WASM independently so app and backend edits reuse this layer.
FROM toolchain AS wasm-builder
WORKDIR /wrk/frontend
COPY ./frontend/crates/chordlib-wasm ./crates/chordlib-wasm
RUN wasm-pack build crates/chordlib-wasm --target web --out-dir ../../packages/chordlib-wasm/pkg --release

FROM toolchain AS frontend-builder
# Install from manifests before copying app source so source edits reuse dependencies.
WORKDIR /wrk/frontend
COPY ./frontend/package.json ./frontend/pnpm-lock.yaml ./frontend/pnpm-workspace.yaml ./
COPY ./frontend/app/package.json ./app/package.json
COPY ./frontend/packages/chordlib-wasm/package.json ./packages/chordlib-wasm/package.json
COPY --from=wasm-builder /wrk/frontend/packages/chordlib-wasm/pkg ./packages/chordlib-wasm/pkg
# Only suppress the root WASM postinstall: dependency lifecycle scripts still run.
# Restore the manifest afterwards; normal local install/build scripts are unchanged.
RUN cp package.json /tmp/frontend-package.json && \
    node -e 'const fs = require("node:fs"); const p = JSON.parse(fs.readFileSync("package.json", "utf8")); delete p.scripts.postinstall; fs.writeFileSync("package.json", JSON.stringify(p));' && \
    pnpm install --frozen-lockfile && \
    mv /tmp/frontend-package.json package.json
COPY ./frontend ./
RUN pnpm --filter app build

# scratch has no /tmp; runtime libraries and amd64 emulation need a writable one.
FROM toolchain AS runtime-dirs
RUN mkdir -m 1777 /runtime-tmp

FROM scratch
COPY --from=runtime-dirs /runtime-tmp /tmp

COPY --from=toolchain /lib/x86_64-linux-gnu/libdl.so.2 /lib/x86_64-linux-gnu/libdl.so.2
COPY --from=toolchain /lib/x86_64-linux-gnu/libpthread.so.0 /lib/x86_64-linux-gnu/libpthread.so.0
COPY --from=toolchain /lib/x86_64-linux-gnu/libm.so.6 /lib/x86_64-linux-gnu/libm.so.6
COPY --from=toolchain /lib/x86_64-linux-gnu/libgcc_s.so.1 /lib/x86_64-linux-gnu/libgcc_s.so.1
COPY --from=toolchain /lib/x86_64-linux-gnu/librt.so.1 /lib/x86_64-linux-gnu/librt.so.1
COPY --from=toolchain /lib/x86_64-linux-gnu/libc.so.6 /lib/x86_64-linux-gnu/libc.so.6
COPY --from=toolchain /lib64/ld-linux-x86-64.so.2 /lib64/ld-linux-x86-64.so.2
COPY --from=toolchain /usr/lib/x86_64-linux-gnu/libssl.so.3 /usr/lib/x86_64-linux-gnu/libssl.so.3
COPY --from=toolchain /usr/lib/x86_64-linux-gnu/libcrypto.so.3 /usr/lib/x86_64-linux-gnu/libcrypto.so.3
COPY --from=toolchain /usr/lib/x86_64-linux-gnu/libz.so.1 /usr/lib/x86_64-linux-gnu/libz.so.1
COPY --from=toolchain /usr/lib/x86_64-linux-gnu/libzstd.so.1 /usr/lib/x86_64-linux-gnu/libzstd.so.1
COPY --from=toolchain /usr/lib/x86_64-linux-gnu/libstdc++.so.6 /usr/lib/x86_64-linux-gnu/libstdc++.so.6
COPY --from=toolchain /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

COPY --from=backend-builder /wrk/backend/target/release/backend /app/worshipviewer
COPY --from=backend-builder /wrk/backend/db-migrations/ /app/db-migrations
COPY --from=frontend-builder /wrk/frontend/app/dist/ /app/static

EXPOSE 8080
# Cloud Run (and other platforms) set PORT; the process must accept traffic on 0.0.0.0, not
# loopback only, or the platform health check will never see an open port.
ENV HOST=0.0.0.0
WORKDIR /app
ENTRYPOINT ["/app/worshipviewer"]
