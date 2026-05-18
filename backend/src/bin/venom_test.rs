//! Run Venom API suites against the backend.
//!
//! By default: pick a free port, start the release backend, run `tests/*.yml`, then stop it.
//! Pass `--no-backend` when the server is already running.
//!
//! Invoked via `cargo venom` (see `.cargo/config.toml`).

use std::io::{self, ErrorKind};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitCode, Stdio};
use std::time::{Duration, Instant};

const HOST: &str = "127.0.0.1";
const DEFAULT_BASE_URL: &str = "http://127.0.0.1:8080";
const READY_TIMEOUT: Duration = Duration::from_secs(30);
const READY_POLL: Duration = Duration::from_millis(200);

struct Options {
    /// Start and stop the release backend around the test run.
    manage_backend: bool,
    /// Base URL for Venom (`--var base_url=…`) and readiness checks when not managing the backend.
    base_url: Option<String>,
    /// Listen port when managing the backend (default: ephemeral).
    port: Option<u16>,
}

fn main() -> ExitCode {
    match run() {
        Ok(code) => ExitCode::from(code),
        Err(err) => {
            eprintln!("venom-test: {err}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> io::Result<u8> {
    let opts = parse_args()?;
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let venom = which_venom()?;
    let suites = venom_suite_files(&root.join("tests"))?;
    if suites.is_empty() {
        return Err(io::Error::new(
            ErrorKind::NotFound,
            "no Venom suites found under tests/*.yml",
        ));
    }

    if opts.manage_backend {
        run_with_managed_backend(&root, &venom, &suites, opts.port)
    } else {
        let base_url = opts
            .base_url
            .unwrap_or_else(|| DEFAULT_BASE_URL.to_string());
        eprintln!("venom-test: using existing backend at {base_url}");
        wait_for_backend(socket_addr(&base_url)?)?;
        run_venom(&venom, &root, &suites, &base_url)
    }
}

fn run_with_managed_backend(
    root: &Path,
    venom: &Path,
    suites: &[PathBuf],
    fixed_port: Option<u16>,
) -> io::Result<u8> {
    let backend_bin = root.join("target/release/backend");
    if !backend_bin.is_file() {
        return Err(io::Error::new(
            ErrorKind::NotFound,
            "release backend binary missing; run `cargo build --release` or `cargo venom`",
        ));
    }

    let static_dir = root.join("static");
    if !static_dir.is_dir() {
        return Err(io::Error::new(
            ErrorKind::NotFound,
            format!(
                "static dir {} is required for the backend",
                static_dir.display()
            ),
        ));
    }

    let port = match fixed_port {
        Some(port) => port,
        None => ephemeral_port()?,
    };
    let base_url = format!("http://{HOST}:{port}");
    eprintln!("venom-test: starting backend on {base_url}");

    let mut backend = spawn_backend(&backend_bin, root, &static_dir, port)?;
    let venom_code = match (|| {
        wait_for_backend(socket_addr(&base_url)?)?;
        run_venom(venom, root, suites, &base_url)
    })() {
        Ok(code) => code,
        Err(err) => {
            let _ = backend.kill();
            let _ = backend.wait();
            return Err(err);
        }
    };
    let _ = backend.kill();
    let _ = backend.wait();
    eprintln!("venom-test: backend stopped");
    Ok(venom_code)
}

fn parse_args() -> io::Result<Options> {
    let mut opts = Options {
        manage_backend: true,
        base_url: None,
        port: None,
    };
    let mut args = std::env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--no-backend" | "--external" => opts.manage_backend = false,
            "--base-url" => {
                opts.base_url = Some(next_arg(&mut args, "--base-url")?);
            }
            "--port" => {
                let raw = next_arg(&mut args, "--port")?;
                opts.port = Some(raw.parse().map_err(|_| {
                    io::Error::new(ErrorKind::InvalidInput, "invalid --port value")
                })?);
            }
            "--help" | "-h" => {
                print_help();
                std::process::exit(0);
            }
            other => {
                return Err(io::Error::new(
                    ErrorKind::InvalidInput,
                    format!("unknown argument {other:?} (try --help)"),
                ));
            }
        }
    }
    if opts.port.is_some() && !opts.manage_backend {
        return Err(io::Error::new(
            ErrorKind::InvalidInput,
            "--port requires a managed backend (omit --no-backend)",
        ));
    }
    Ok(opts)
}

fn next_arg(args: &mut impl Iterator<Item = String>, flag: &str) -> io::Result<String> {
    args.next()
        .ok_or_else(|| io::Error::new(ErrorKind::InvalidInput, format!("missing value for {flag}")))
}

fn print_help() {
    eprintln!(
        r#"venom-test — run Venom suites (via `cargo venom`)

USAGE:
    cargo venom [-- FLAGS]

FLAGS:
    (default)           Start backend on a free port, run tests, stop backend
    --no-backend        Use an already-running server (default: {DEFAULT_BASE_URL})
    --external          Alias for --no-backend
    --base-url URL      Base URL for Venom and readiness (with --no-backend)
    --port PORT         Fixed listen port instead of a random one (managed backend only)
    -h, --help          Show this help
"#
    );
}

fn ephemeral_port() -> io::Result<u16> {
    let listener = TcpListener::bind((HOST, 0))?;
    Ok(listener.local_addr()?.port())
}

/// `http://127.0.0.1:8080/api` → `127.0.0.1:8080`
fn socket_addr(base_url: &str) -> io::Result<String> {
    let authority = base_url
        .strip_prefix("http://")
        .or_else(|| base_url.strip_prefix("https://"))
        .unwrap_or(base_url)
        .split('/')
        .next()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            io::Error::new(
                ErrorKind::InvalidInput,
                format!("invalid base URL {base_url:?}"),
            )
        })?;
    Ok(authority.to_string())
}

fn which_venom() -> io::Result<PathBuf> {
    let path = std::env::var_os("PATH").unwrap_or_default();
    for dir in std::env::split_paths(&path) {
        let candidate = dir.join("venom");
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err(io::Error::new(
        ErrorKind::NotFound,
        "venom not found on PATH (install v1.2.0 from https://github.com/ovh/venom/releases)",
    ))
}

fn venom_suite_files(tests_dir: &Path) -> io::Result<Vec<PathBuf>> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(tests_dir)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "yml"))
        .collect();
    files.sort();
    Ok(files)
}

fn spawn_backend(
    backend_bin: &Path,
    root: &Path,
    static_dir: &Path,
    port: u16,
) -> io::Result<Child> {
    Command::new(backend_bin)
        .current_dir(root)
        .env("HOST", HOST)
        .env("PORT", port.to_string())
        .env("STATIC_DIR", static_dir)
        .env("BLOB_DIR", root.join("blobs"))
        .env("DB_MIGRATION_PATH", root.join("db-migrations"))
        .env("INITIAL_ADMIN_USER_EMAIL", "admin@example.com")
        .env("INITIAL_ADMIN_USER_TEST_SESSION", "true")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
}

fn wait_for_backend(addr: String) -> io::Result<()> {
    let deadline = Instant::now() + READY_TIMEOUT;
    loop {
        if TcpStream::connect(&addr).is_ok() {
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(io::Error::new(
                ErrorKind::TimedOut,
                format!("backend did not accept connections on {addr} within {READY_TIMEOUT:?}"),
            ));
        }
        std::thread::sleep(READY_POLL);
    }
}

fn run_venom(venom: &Path, root: &Path, suites: &[PathBuf], base_url: &str) -> io::Result<u8> {
    let var = format!("base_url={base_url}");
    let status = Command::new(venom)
        .current_dir(root)
        .arg("run")
        .arg("--var")
        .arg(&var)
        .args(suites)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit())
        .status()?;
    Ok(u8::try_from(status.code().unwrap_or(1)).unwrap_or(1))
}
