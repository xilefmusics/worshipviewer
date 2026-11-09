use std::path::PathBuf;

use clap::{Args, Parser, Subcommand};

use crate::output::OutputFormat;

#[derive(Debug, Parser)]
#[command(
    name = "worshipviewer",
    version,
    about = "AI-friendly CLI for the Worship Viewer REST API",
    long_about = "Talk to Worship Viewer from the terminal. Output is JSON by default when \
                  piped; use --output pretty for human-readable output on a TTY.\n\n\
                  Authenticate with --sso-session, --bearer-token, or `auth otp-verify`. \
                  Configure defaults in ~/.worshipviewer/config.toml.\n\n\
                  Examples:\n  \
                  worshipviewer songs list --q grace --sort relevance\n  \
                  worshipviewer collections transfer-song COL_ID SONG_ID --json '{\"target\":\"OTHER_COL\"}'\n  \
                  worshipviewer setlists player SETLIST_ID --output pretty"
)]
pub struct Cli {
    #[arg(
        long,
        global = true,
        env = "WORSHIPVIEWER_BASE_URL",
        help = "API base URL (default http://127.0.0.1:8080 or config file)"
    )]
    pub base_url: Option<String>,

    #[arg(
        long,
        global = true,
        env = "WORSHIPVIEWER_SSO_SESSION",
        help = "Session cookie value for sso_session"
    )]
    pub sso_session: Option<String>,

    #[arg(
        long,
        env = "WORSHIPVIEWER_BEARER_TOKEN",
        global = true,
        help = "Bearer token (session id) for Authorization header"
    )]
    pub bearer_token: Option<String>,

    #[arg(
        long,
        env = "WORSHIPVIEWER_IMPERSONATION_COOKIE",
        global = true,
        help = "Browser impersonation cookie value for sso_session authentication"
    )]
    pub impersonation_cookie: Option<String>,

    #[arg(
        long,
        env = "WORSHIPVIEWER_OUTPUT",
        default_value = "auto",
        global = true,
        help = "Output format: auto, json, pretty, ndjson (one JSON object per line for lists)"
    )]
    pub output: OutputFormat,

    #[arg(
        long,
        global = true,
        help = "Print planned HTTP request without sending (mutations only)"
    )]
    pub dry_run: bool,

    #[arg(
        long,
        env = "WORSHIPVIEWER_TIMEOUT_SECS",
        global = true,
        help = "HTTP timeout in seconds"
    )]
    pub timeout_secs: Option<u64>,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Public server metadata (no auth).
    About,
    /// Fetch or inspect the live OpenAPI schema.
    Schema(SchemaArgs),
    /// OTP authentication, browser impersonation, and logout.
    Auth {
        #[command(subcommand)]
        command: AuthCommand,
    },
    /// Start or inspect shared presentation rooms.
    Rooms {
        #[command(subcommand)]
        command: RoomsCommand,
    },
    /// Manage video, audio, images, slide decks, and URL-backed media.
    Media {
        #[command(subcommand)]
        command: MediaCommand,
    },
    Users {
        #[command(subcommand)]
        command: UsersCommand,
    },
    Sessions {
        #[command(subcommand)]
        command: SessionsCommand,
    },
    Songs {
        #[command(subcommand)]
        command: SongsCommand,
    },
    Collections {
        #[command(subcommand)]
        command: CollectionsCommand,
    },
    Setlists {
        #[command(subcommand)]
        command: SetlistsCommand,
    },
    Blobs {
        #[command(subcommand)]
        command: BlobsCommand,
    },
    Teams {
        #[command(subcommand)]
        command: TeamsCommand,
    },
    Monitoring {
        #[command(subcommand)]
        command: MonitoringCommand,
    },
}

/// Pagination flags shared by list commands.
#[derive(Debug, Args, Clone, Default)]
pub struct PageArgs {
    #[arg(long, help = "Zero-based page index")]
    pub page: Option<u32>,

    #[arg(long, help = "Items per page (default 50, max 500)")]
    pub page_size: Option<u32>,

    #[arg(
        long,
        help = "Include X-Total-Count and Link headers in a pagination wrapper (json/pretty only)"
    )]
    pub with_meta: bool,
}

/// Search and team filter for hub list routes.
#[derive(Debug, Args, Clone, Default)]
pub struct HubFilterArgs {
    #[arg(
        long,
        help = "Search query (title, name, or lyrics depending on resource)"
    )]
    pub q: Option<String>,

    #[arg(long, help = "Filter by owning team id")]
    pub team: Option<String>,
}

/// Shared paging, search, and owning-team filters for resource lists.
#[derive(Debug, Args, Clone, Default)]
pub struct HubListArgs {
    #[command(flatten)]
    pub page: PageArgs,

    #[command(flatten)]
    pub filter: HubFilterArgs,
}

/// List flags for songs (includes sort, language, and tag filters).
#[derive(Debug, Args, Clone, Default)]
pub struct SongListArgs {
    #[command(flatten)]
    pub page: PageArgs,

    #[command(flatten)]
    pub filter: HubFilterArgs,

    #[arg(
        long,
        help = "Sort order: -id (default), title, -title, relevance (requires --q), id"
    )]
    pub sort: Option<String>,

    #[arg(
        long,
        help = "Filter songs whose metadata includes this BCP 47 language tag"
    )]
    pub lang: Option<String>,

    #[arg(long, help = "Filter by tag substring")]
    pub tag: Option<String>,
}

#[derive(Debug, Args, Clone, Default)]
pub struct MediaListArgs {
    #[command(flatten)]
    pub page: PageArgs,

    #[arg(long, help = "Search media titles")]
    pub q: Option<String>,

    #[arg(long, help = "Filter by readable owning team id")]
    pub team: Option<String>,

    #[arg(long, help = "Filter AV backgrounds: true or false")]
    pub is_background: Option<bool>,
}

#[derive(Debug, Args)]
pub struct SchemaArgs {
    #[command(subcommand)]
    pub command: Option<SchemaCommand>,

    #[arg(long, help = "Only include OpenAPI paths starting with this prefix")]
    pub path_prefix: Option<String>,
}

#[derive(Debug, Subcommand)]
pub enum SchemaCommand {
    /// Resolve a CLI domain/action pair to request/response schemas.
    Inspect { domain: String, action: String },
}

#[derive(Debug, Subcommand)]
pub enum AuthCommand {
    OtpRequest {
        #[arg(long, help = "JSON body, e.g. {\"email\":\"you@example.com\"}")]
        json: String,
    },
    OtpVerify {
        #[arg(long, help = "JSON body with email and code")]
        json: String,
    },
    Logout,
    /// Show whether the browser session is impersonating another user.
    ImpersonationCurrent,
    /// Stop browser impersonation while keeping the primary session.
    ImpersonationStop,
}

#[derive(Debug, Subcommand)]
pub enum UsersCommand {
    /// List all users (admin).
    List {
        #[command(flatten)]
        page: PageArgs,
    },
    /// Get a single user by id.
    Get {
        id: String,
    },
    /// Current user (`GET /api/v1/users/me`).
    Me,
    /// HTTP audit metrics for the current user.
    MeMetrics,
    /// HTTP audit metrics for a user (admin).
    Metrics {
        id: String,
    },
    /// Upload profile picture from a file (`PUT .../profile-picture`).
    ProfilePicturePut {
        file: PathBuf,
        #[arg(long, help = "MIME type (inferred from extension when omitted)")]
        content_type: Option<String>,
    },
    /// Remove profile picture.
    ProfilePictureDelete,
    Create {
        #[arg(long)]
        json: String,
    },
    Delete {
        id: String,
    },
    /// Start browser impersonation for a user (cookie auth required).
    Impersonate {
        user_id: String,
    },
}

#[derive(Debug, Subcommand)]
pub enum SessionsCommand {
    ListMine {
        #[command(flatten)]
        page: PageArgs,
    },
    GetMine {
        id: String,
    },
    /// `GET /api/v1/users/me/sessions/current`
    GetCurrentMine,
    /// `GET /api/v1/users/me/session/metrics`
    CurrentSessionMetrics,
    /// `GET /api/v1/users/me/sessions/{id}/metrics`
    GetMineMetrics {
        id: String,
    },
    DeleteMine {
        id: String,
    },
    CreateForUser {
        user_id: String,
    },
    ListForUser {
        user_id: String,
        #[command(flatten)]
        page: PageArgs,
    },
    GetForUser {
        user_id: String,
        id: String,
    },
    /// `GET /api/v1/users/{user_id}/sessions/{id}/metrics`
    GetForUserMetrics {
        user_id: String,
        id: String,
    },
    DeleteForUser {
        user_id: String,
        id: String,
    },
}

#[derive(Debug, Subcommand)]
pub enum SongsCommand {
    /// List songs with optional search and filters.
    List {
        #[command(flatten)]
        list: SongListArgs,
    },
    /// Get a song by id.
    Get {
        id: String,
    },
    /// Player payload for a single song.
    Player {
        id: String,
    },
    Create {
        #[arg(long, help = "JSON CreateSong body")]
        json: String,
    },
    Update {
        id: String,
        #[arg(long)]
        json: String,
    },
    Patch {
        id: String,
        #[arg(long)]
        json: String,
    },
    Move {
        id: String,
        #[arg(long, help = "JSON MoveOwner body, e.g. {\"owner\":\"team_id\"}")]
        json: String,
    },
    Delete {
        id: String,
    },
    LikeStatus {
        id: String,
    },
    UpdateLikeStatus {
        id: String,
        liked: bool,
    },
}

#[derive(Debug, Subcommand)]
pub enum CollectionsCommand {
    /// List collections with optional search and team filter.
    List {
        #[command(flatten)]
        list: HubListArgs,
    },
    /// Get a collection by id.
    Get {
        id: String,
    },
    /// Resolved songs for collection slots.
    Songs {
        id: String,
        #[command(flatten)]
        page: PageArgs,
    },
    /// Aggregated player payload (items + toc).
    Player {
        id: String,
    },
    Create {
        #[arg(long)]
        json: String,
    },
    Update {
        id: String,
        #[arg(long)]
        json: String,
    },
    Patch {
        id: String,
        #[arg(long)]
        json: String,
    },
    Move {
        id: String,
        #[arg(long)]
        json: String,
    },
    Delete {
        id: String,
    },
    /// Move a song link to another collection atomically.
    TransferSong {
        id: String,
        song_id: String,
        #[arg(
            long,
            help = "JSON TransferCollectionSong body, e.g. {\"target\":\"col_id\",\"language\":\"de\"}"
        )]
        json: String,
    },
    /// Upload a cover image (JPEG or PNG).
    CoverPut {
        id: String,
        file: PathBuf,
        #[arg(long, help = "MIME type (inferred from extension when omitted)")]
        content_type: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum SetlistsCommand {
    /// List setlists with optional search and team filter.
    List {
        #[command(flatten)]
        list: HubListArgs,
    },
    /// Get a setlist by id.
    Get {
        id: String,
    },
    /// Resolved songs for setlist slots.
    Songs {
        id: String,
        #[command(flatten)]
        page: PageArgs,
    },
    /// Aggregated player payload (items + toc).
    Player {
        id: String,
    },
    Create {
        #[arg(
            long,
            help = "JSON CreateSetlist body; ordered tagged items (song slots with key/tempo/language/flow, or media ids)"
        )]
        json: String,
    },
    Update {
        id: String,
        #[arg(long)]
        json: String,
    },
    Patch {
        id: String,
        #[arg(long)]
        json: String,
    },
    Move {
        id: String,
        #[arg(long)]
        json: String,
    },
    Delete {
        id: String,
    },
}

#[derive(Debug, Subcommand)]
pub enum TeamsCommand {
    /// List teams visible to the current user.
    List {
        #[command(flatten)]
        list: HubListArgs,
    },
    /// Get a team by id.
    Get {
        id: String,
    },
    Invitations {
        #[command(subcommand)]
        command: TeamInvitationsCommand,
    },
    Create {
        #[arg(long)]
        json: String,
    },
    Update {
        id: String,
        #[arg(long)]
        json: String,
    },
    Patch {
        id: String,
        #[arg(long)]
        json: String,
    },
    Delete {
        id: String,
    },
    /// Upload a team cover image (JPEG or PNG).
    CoverPut {
        id: String,
        file: PathBuf,
        #[arg(long)]
        content_type: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum TeamInvitationsCommand {
    List {
        team_id: String,
        #[command(flatten)]
        page: PageArgs,
    },
    Create {
        team_id: String,
    },
    Get {
        team_id: String,
        invitation_id: String,
    },
    Delete {
        team_id: String,
        invitation_id: String,
    },
    Accept {
        team_id: String,
        invitation_id: String,
    },
    /// `POST /api/v1/invitations/{invitation_id}/accept` (deprecated).
    AcceptLegacy {
        invitation_id: String,
    },
}

#[derive(Debug, Subcommand)]
pub enum BlobsCommand {
    /// List all blobs.
    List {
        #[command(flatten)]
        page: PageArgs,
    },
    /// Get a blob by id.
    Get {
        id: String,
    },
    Create {
        #[arg(long)]
        json: String,
    },
    Update {
        id: String,
        #[arg(long)]
        json: String,
    },
    Patch {
        id: String,
        #[arg(long)]
        json: String,
    },
    Move {
        id: String,
        #[arg(long)]
        json: String,
    },
    Delete {
        id: String,
    },
    /// Absolute download URL for blob data.
    DownloadUrl {
        id: String,
    },
    /// Download raw bytes (`GET /api/v1/blobs/{id}/data`).
    DownloadData {
        id: String,
        #[arg(long, help = "Write to file instead of stdout")]
        output: Option<PathBuf>,
    },
    /// Upload raw bytes (`PUT /api/v1/blobs/{id}/data`).
    UploadData {
        id: String,
        file: PathBuf,
        #[arg(long)]
        content_type: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum MonitoringCommand {
    /// Admin: paginated HTTP audit log.
    AuditLogs {
        #[command(flatten)]
        page: PageArgs,
    },
    /// Admin: daily metrics for inclusive UTC RFC 3339 timestamps.
    Metrics {
        #[arg(long, help = "Start timestamp (RFC 3339 UTC)")]
        start: String,
        #[arg(long, help = "End timestamp (RFC 3339 UTC)")]
        end: String,
    },
}

#[derive(Debug, Subcommand)]
pub enum MediaCommand {
    List {
        #[command(flatten)]
        list: MediaListArgs,
    },
    Get {
        id: String,
    },
    /// Create a YouTube or Spotify URL-backed media item.
    Create {
        #[arg(long, help = "JSON CreateMedia body")]
        json: String,
    },
    /// Upload an image, video, audio file, or slide-deck sources as new media.
    Upload {
        #[arg(long, help = "Uploaded kind: image, video, audio, or slide_deck")]
        kind: String,
        #[arg(long, help = "JSON CreateUploadedMedia metadata")]
        metadata: String,
        #[arg(long = "file", required = true, num_args = 1.., help = "Source file; repeat for slide-deck pages")]
        files: Vec<PathBuf>,
    },
    Update {
        id: String,
        #[arg(long, help = "JSON UpdateMedia body")]
        json: String,
    },
    Move {
        id: String,
        #[arg(long, help = "JSON MoveOwner body")]
        json: String,
    },
    Duplicate {
        id: String,
        #[arg(long, help = "JSON DuplicateMedia body (defaults to {})")]
        json: Option<String>,
    },
    Delete {
        id: String,
    },
    /// Replace uploaded video/audio/image content or stage a slide-deck page.
    UploadAsset {
        id: String,
        file: PathBuf,
        #[arg(long, help = "Upload kind: video, audio, image, pdf, or svg")]
        kind: String,
        #[arg(long, help = "Replace this existing slide-deck page")]
        replace_page: Option<String>,
        #[arg(long, help = "MIME type (inferred from file extension when omitted)")]
        content_type: Option<String>,
    },
    /// Begin a reorder/removal revision for a slide deck.
    DeckBegin {
        id: String,
    },
    /// Commit the staged page order.
    DeckCommit {
        id: String,
        #[arg(long, help = "JSON CommitDeck body")]
        json: String,
    },
    /// Download an asset's original bytes.
    DownloadAsset {
        media_id: String,
        asset_id: String,
        #[arg(long = "save-to", help = "Write bytes to this file instead of stdout")]
        output: Option<PathBuf>,
        #[arg(long, help = "Optional HTTP byte range, e.g. bytes=0-1023")]
        range: Option<String>,
    },
    /// Read asset headers without downloading its bytes.
    HeadAsset {
        media_id: String,
        asset_id: String,
        #[arg(long, help = "Optional HTTP byte range, e.g. bytes=0-1023")]
        range: Option<String>,
    },
}

#[derive(Debug, Subcommand)]
pub enum RoomsCommand {
    List {
        #[command(flatten)]
        list: HubListArgs,
    },
    Create {
        #[arg(long, help = "JSON CreateRoom body")]
        json: String,
    },
    Join {
        id: String,
        #[arg(long, help = "Resume credential from a previous join")]
        resume_credential: Option<String>,
    },
    History {
        id: String,
        #[arg(long, help = "Resume credential returned by rooms join")]
        resume_credential: String,
        #[arg(long, help = "Epoch from the WebSocket authorized event")]
        epoch: u64,
        #[arg(long, help = "Sequence from the WebSocket authorized event")]
        sequence: u64,
    },
    /// Connect with a room ticket, replay history, and print realtime events.
    Socket {
        #[arg(long, help = "One-time connection_ticket returned by rooms join")]
        connection_ticket: String,
        #[arg(long, help = "Room id; enables an automatic history replay")]
        room_id: Option<String>,
        #[arg(long, help = "Resume credential returned by rooms join")]
        resume_credential: Option<String>,
        #[arg(long = "message", help = "Raw client event JSON; may be repeated")]
        messages: Vec<String>,
        #[arg(
            long,
            default_value_t = 2,
            help = "Seconds to receive events after sending messages"
        )]
        wait_secs: u64,
        #[arg(long, help = "Keep receiving events until the room ends")]
        follow: bool,
    },
    Close {
        id: String,
    },
}
