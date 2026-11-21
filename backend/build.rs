use std::process::Command;

fn main() {
    println!("cargo:rerun-if-env-changed=APP_VERSION");
    println!("cargo:rerun-if-env-changed=VITE_APP_VERSION");

    let version = ["VITE_APP_VERSION", "APP_VERSION"]
        .into_iter()
        .filter_map(|name| std::env::var(name).ok())
        .find(|version| !version.is_empty())
        .or_else(|| {
            Command::new("git")
                .current_dir(env!("CARGO_MANIFEST_DIR"))
                .args(["describe", "--tags", "--always", "--dirty"])
                .output()
                .ok()
                .filter(|output| output.status.success())
                .and_then(|output| String::from_utf8(output.stdout).ok())
                .map(|version| version.trim().to_owned())
                .filter(|version| !version.is_empty())
        })
        .unwrap_or_else(|| "0.0.0-dev".to_owned());

    println!("cargo:rustc-env=WV_APP_VERSION={version}");
}
