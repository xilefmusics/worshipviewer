---
name: worshipviewer-cli
description: Use when operating the Worship Viewer REST API through the repository's worshipviewer CLI, including queries, resource edits, uploads, authentication, or shared rooms. Confirm the selected server and exact command or schema before acting.
---

# Worship Viewer CLI

Use the `worshipviewer` CLI for API work in this repository. It covers `about`, `schema`, `auth`, `rooms`, `media`, `users`, `sessions`, `songs`, `collections`, `setlists`, `blobs`, `teams`, and `monitoring`.

## Discover the command and payload

- Start with `worshipviewer --help`, then `worshipviewer <domain> --help` and `worshipviewer <domain> <command> --help` for the exact current syntax. Resource IDs are positional in the CLI source; do not copy stale README examples that use `--id`.
- If the binary is unavailable but this repository is checked out, run the same commands as `cargo run --manifest-path cli/Cargo.toml -- <arguments>` instead of installing a global binary.
- For JSON request bodies, inspect the API contract first, for example `worshipviewer schema inspect songs create --output json`. Use `worshipviewer schema --path-prefix /api/v1/songs --output json` to inspect related operations. Build the body from the returned schema and existing resource data; do not guess fields or enum values.
- Pass request bodies with `--json '<valid JSON>'`. For replacement, `update` is a full `PUT`; use `patch` for partial changes when that command exists.

## Choose the server and authenticate

- The base URL is resolved from CLI flag, environment, `~/.worshipviewer/config.toml`, then `http://127.0.0.1:8080`. First use may create that config file with defaults. Check the intended target before any write; never infer a production URL. Use `--base-url` when the requested target needs to be explicit, and use `worshipviewer about --output json` to check the selected deployment.
- Authentication can come from `--sso-session`, `WORSHIPVIEWER_SSO_SESSION`, or the config file; bearer auth can come from `--bearer-token` or `WORSHIPVIEWER_BEARER_TOKEN`. Prefer already-configured environment credentials for commands. Do not print, repeat, or put session values, bearer tokens, OTP codes, room tickets, or resume credentials into saved commands or logs.
- Browser impersonation uses a separate `WORSHIPVIEWER_IMPERSONATION_COOKIE` / `--impersonation-cookie` alongside cookie authentication. Treat it as a secret; bearer authentication does not activate browser impersonation.
- If the required target or authentication is missing, ask for the missing value rather than probing other deployments or initiating an OTP flow without a request.

## Read and change data

- Prefer `--output json` for structured results and `--output ndjson` for list processing. `auto` is pretty JSON in a terminal and compact JSON when piped.
- Lists default to page `0` with 50 items; use `--page` and `--page-size` (maximum 500) to choose a page. The CLI returns one page per command. Add `--with-meta` with JSON or pretty output when total count and pagination links are needed; it cannot be combined with NDJSON.
- Before a requested mutation, run the same command with `--dry-run --output json` and review its planned method, path, and body. Dry-run sends no request and does not confirm server-side permissions or success. Then perform the mutation only when the user's request authorizes it, and inspect the returned resource or status.
- Treat `delete`, upload/replace, invitation actions, impersonation, logout, and room socket messages as state-changing operations. Check the target and exact resource before running them. Use dry-run where supported; check `--help` for each command.
- If the command or schema is unclear, inspect the live schema or the matching implementation under `cli/src/handlers/` rather than switching to an improvised HTTP request.

## Useful patterns

```sh
worshipviewer songs list --q grace --sort relevance --output ndjson
worshipviewer songs get SONG_ID --output json
worshipviewer schema inspect setlists create --output json
worshipviewer setlists player SETLIST_ID --output json
worshipviewer songs delete SONG_ID --dry-run --output json
```

Room join responses contain short-lived connection credentials. Keep them out of transcripts and logs, and use only the credential returned for the room session being handled.

For CLI installation and local development setup, see the [README CLI section](../../../README.md#command-line-interface-cli). The current command definitions are in [commands.rs](../../../cli/src/commands.rs).
