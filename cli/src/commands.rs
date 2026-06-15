use std::path::PathBuf;

use clap::{Args, Parser, Subcommand};

use crate::output::OutputFormat;

#[derive(Debug, Parser)]
#[command(
    name = "worshipviewer",
    version,
    about = "CLI for the Worship Viewer REST API"
)]
pub struct Cli {
    #[arg(long, global = true)]
    pub base_url: Option<String>,

    #[arg(long, global = true)]
    pub sso_session: Option<String>,

    #[arg(long, env = "WORSHIPVIEWER_BEARER_TOKEN", global = true)]
    pub bearer_token: Option<String>,

    #[arg(
        long,
        env = "WORSHIPVIEWER_OUTPUT",
        default_value = "auto",
        global = true
    )]
    pub output: OutputFormat,

    #[arg(long, global = true)]
    pub dry_run: bool,

    #[arg(long, env = "WORSHIPVIEWER_TIMEOUT_SECS", global = true)]
    pub timeout_secs: Option<u64>,

    #[command(subcommand)]
    pub command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    /// Public server metadata (no auth).
    About,
    Schema(SchemaArgs),
    Auth {
        #[command(subcommand)]
        command: AuthCommand,
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

#[derive(Debug, Args)]
pub struct SchemaArgs {
    #[command(subcommand)]
    pub command: Option<SchemaCommand>,

    #[arg(long)]
    pub path_prefix: Option<String>,
}

#[derive(Debug, Subcommand)]
pub enum SchemaCommand {
    Inspect { domain: String, action: String },
}

#[derive(Debug, Subcommand)]
pub enum AuthCommand {
    OtpRequest {
        #[arg(long)]
        json: String,
    },
    OtpVerify {
        #[arg(long)]
        json: String,
    },
    Logout,
}

#[derive(Debug, Subcommand)]
pub enum UsersCommand {
    /// List all users.
    List {
        #[arg(long)]
        page: Option<u32>,
        #[arg(long)]
        page_size: Option<u32>,
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
        #[arg(long)]
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
}

#[derive(Debug, Subcommand)]
pub enum SessionsCommand {
    ListMine {
        #[arg(long)]
        page: Option<u32>,
        #[arg(long)]
        page_size: Option<u32>,
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
        #[arg(long)]
        page: Option<u32>,
        #[arg(long)]
        page_size: Option<u32>,
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
    /// List all songs.
    List {
        #[arg(long)]
        page: Option<u32>,
        #[arg(long)]
        page_size: Option<u32>,
    },
    /// Get a song by id.
    Get {
        id: String,
    },
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
    /// List all collections.
    List {
        #[arg(long)]
        page: Option<u32>,
        #[arg(long)]
        page_size: Option<u32>,
    },
    /// Get a collection by id.
    Get {
        id: String,
    },
    Songs {
        id: String,
        #[arg(long)]
        page: Option<u32>,
        #[arg(long)]
        page_size: Option<u32>,
    },
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
}

#[derive(Debug, Subcommand)]
pub enum SetlistsCommand {
    /// List all setlists.
    List {
        #[arg(long)]
        page: Option<u32>,
        #[arg(long)]
        page_size: Option<u32>,
    },
    /// Get a setlist by id.
    Get {
        id: String,
    },
    Songs {
        id: String,
        #[arg(long)]
        page: Option<u32>,
        #[arg(long)]
        page_size: Option<u32>,
    },
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
}

#[derive(Debug, Subcommand)]
pub enum TeamsCommand {
    /// List teams visible to the current user.
    List {
        #[arg(long)]
        page: Option<u32>,
        #[arg(long)]
        page_size: Option<u32>,
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
}

#[derive(Debug, Subcommand)]
pub enum TeamInvitationsCommand {
    List {
        team_id: String,
        #[arg(long)]
        page: Option<u32>,
        #[arg(long)]
        page_size: Option<u32>,
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
        #[arg(long)]
        page: Option<u32>,
        #[arg(long)]
        page_size: Option<u32>,
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
    DownloadUrl {
        id: String,
    },
    /// Download raw bytes (`GET /api/v1/blobs/{id}/data`).
    DownloadData {
        id: String,
        #[arg(long)]
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
        #[arg(long)]
        page: Option<u32>,
        #[arg(long)]
        page_size: Option<u32>,
    },
    /// Admin: daily metrics for inclusive UTC RFC 3339 timestamps.
    Metrics {
        #[arg(long)]
        start: String,
        #[arg(long)]
        end: String,
    },
}
