# Docker `scratch` image — redistributed libraries

Production images use a **`FROM scratch`** runtime stage (see root [`Dockerfile`](../../Dockerfile)). The binary is statically linked where possible but still depends on copied dynamic libraries from the Debian builder:

| Library | Purpose |
|---------|---------|
| `libc.so.6`, `ld-linux-x86-64.so.2` | glibc runtime |
| `libssl.so.3`, `libcrypto.so.3` | OpenSSL (TLS) |
| `libstdc++.so.6`, `libgcc_s.so.1` | C++ runtime |
| `libpthread`, `libdl`, `libm`, `librt`, `libz`, `libzstd` | POSIX / compression |
| `ca-certificates.crt` | TLS trust store |

## Compliance notes

- **glibc** and **OpenSSL** are subject to their respective licenses (LGPL/GPL + linking exception for glibc in many deployments; OpenSSL license).
- Worship Viewer **AGPL** applies to the application source. Redistributed **system libraries** remain under their upstream licenses.
- Maintain this list when adding `COPY --from=builder` lines to the Dockerfile.

## Platform

Published images target **linux/amd64**. ARM builds copy the analogous paths from the builder triplet.
