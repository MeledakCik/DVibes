//! DVibes native shell.
//!
//! The UI is a static web bundle. This crate adds what a webview cannot do on
//! its own:
//! 1. A CORS-free HTTP client (`tauri-plugin-http`).
//! 2. Offline storage (`download_track`, `list_downloads`, `delete_download`,
//!    `cancel_download`, `save_imported_audio`) in `$APPDATA/offline/`.
//! 3. On-demand native stream caching (`cache_stream_track`, `clear_stream_cache`)
//!    in `$APPDATA/stream_cache/` using 2 MB ranged requests and custom
//!    User-Agent headers so YouTube/googlevideo streams that reject WebView
//!    `<audio>` headers play reliably via Tauri's `asset://` protocol.

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime},
};

use reqwest::header::{ACCEPT, CONTENT_RANGE, RANGE};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::{fs, io::AsyncWriteExt};

/// Ranged requests keep googlevideo from throttling long single downloads.
const CHUNK_BYTES: u64 = 2 * 1024 * 1024;
const MAX_STREAM_CACHE_FILES: usize = 16;
const DEFAULT_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const AUDIO_EXTS: [&str; 8] = ["m4a", "webm", "mp3", "ogg", "flac", "wav", "aac", "opus"];

#[derive(Default)]
struct DownloadState {
    cancels: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Progress {
    video_id: String,
    received: u64,
    total: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadResult {
    video_id: String,
    path: String,
    thumb_path: Option<String>,
    bytes: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ListedFile {
    video_id: String,
    path: String,
    thumb_path: Option<String>,
    bytes: u64,
}

/// Validates track IDs (11-char YouTube IDs as well as `local-*` and `audius-*` IDs)
/// while strictly blocking path traversal characters.
fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn sanitize_ext(ext: Option<&str>) -> &'static str {
    match ext.map(|s| s.trim_start_matches('.').to_ascii_lowercase()).as_deref() {
        Some("webm") => "webm",
        Some("mp3") => "mp3",
        Some("ogg") => "ogg",
        Some("flac") => "flac",
        Some("wav") => "wav",
        Some("aac") => "aac",
        Some("opus") => "opus",
        _ => "m4a",
    }
}

fn offline_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("offline");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn stream_cache_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("stream_cache");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

async fn remove_files_for(dir: &Path, video_id: &str) {
    let prefix = format!("{video_id}.");
    if let Ok(mut entries) = fs::read_dir(dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            if entry.file_name().to_string_lossy().starts_with(&prefix) {
                let _ = fs::remove_file(entry.path()).await;
            }
        }
    }
}

async fn find_existing_audio(dir: &Path, video_id: &str) -> Option<(PathBuf, u64)> {
    for ext in AUDIO_EXTS {
        let candidate = dir.join(format!("{video_id}.{ext}"));
        if let Ok(meta) = fs::metadata(&candidate).await {
            if meta.len() > 1024 {
                return Some((candidate, meta.len()));
            }
        }
    }
    None
}

async fn prune_stream_cache(dir: &Path, keep_max: usize) {
    let Ok(mut entries) = fs::read_dir(dir).await else {
        return;
    };
    let mut files: Vec<(PathBuf, SystemTime)> = Vec::new();
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if path
            .file_name()
            .and_then(|n| n.to_str())
            .map(|s| s.ends_with(".part"))
            .unwrap_or(false)
        {
            let _ = fs::remove_file(&path).await;
            continue;
        }
        let modified = entry
            .metadata()
            .await
            .and_then(|m| m.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        files.push((path, modified));
    }
    if files.len() <= keep_max {
        return;
    }
    files.sort_by(|a, b| b.1.cmp(&a.1));
    for (old_path, _) in files.into_iter().skip(keep_max) {
        let _ = fs::remove_file(old_path).await;
    }
}

async fn fetch_audio(
    app: &AppHandle,
    video_id: &str,
    url: &str,
    user_agent: Option<&str>,
    part_path: &Path,
    cancel: &AtomicBool,
    emit_progress: bool,
) -> Result<u64, String> {
    let client = reqwest::Client::builder()
        .user_agent(user_agent.unwrap_or(DEFAULT_UA))
        .timeout(Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())?;

    let mut file = fs::File::create(part_path).await.map_err(|e| e.to_string())?;
    let mut received: u64 = 0;
    let mut total: u64 = 0;
    let mut use_ranges = true;

    loop {
        if cancel.load(Ordering::Relaxed) {
            return Err("cancelled".into());
        }

        let mut req = client.get(url).header(ACCEPT, "*/*");
        if use_ranges {
            let end = received + CHUNK_BYTES - 1;
            req = req.header(RANGE, format!("bytes={received}-{end}"));
        }

        let response = req
            .send()
            .await
            .map_err(|e| format!("network error: {e}"))?;

        let status = response.status();
        if status.as_u16() == 416 {
            break; // asked past the end: everything is already written
        }
        // Some mirrors reject Range headers on initial chunk; retry once without Range.
        if !status.is_success() && use_ranges && received == 0 {
            use_ranges = false;
            continue;
        }
        if !status.is_success() {
            return Err(format!("server answered HTTP {}", status.as_u16()));
        }

        let partial = status.as_u16() == 206;
        if partial {
            if let Some(size) = response
                .headers()
                .get(CONTENT_RANGE)
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.rsplit('/').next())
                .and_then(|v| v.parse::<u64>().ok())
            {
                total = size;
            }
        } else {
            total = response.content_length().unwrap_or(0);
        }

        let bytes = response.bytes().await.map_err(|e| format!("network error: {e}"))?;
        if bytes.is_empty() {
            break;
        }
        file.write_all(&bytes).await.map_err(|e| e.to_string())?;
        received += bytes.len() as u64;

        if emit_progress {
            let _ = app.emit(
                "download-progress",
                Progress {
                    video_id: video_id.to_string(),
                    received,
                    total,
                },
            );
        }

        // Server ignored the Range header and sent the whole file at once.
        if !partial || !use_ranges {
            break;
        }
        if total > 0 && received >= total {
            break;
        }
    }

    file.flush().await.map_err(|e| e.to_string())?;

    if received == 0 {
        return Err("the server returned an empty file".into());
    }
    Ok(received)
}

async fn fetch_thumbnail(url: &str, target: &Path) -> bool {
    let Ok(client) = reqwest::Client::builder()
        .user_agent(DEFAULT_UA)
        .timeout(Duration::from_secs(20))
        .build()
    else {
        return false;
    };
    let Ok(response) = client.get(url).send().await else {
        return false;
    };
    if !response.status().is_success() {
        return false;
    }
    let Ok(bytes) = response.bytes().await else {
        return false;
    };
    if bytes.is_empty() || bytes.len() > 8 * 1024 * 1024 {
        return false;
    }
    fs::write(target, &bytes).await.is_ok()
}

#[tauri::command]
async fn download_track(
    app: AppHandle,
    state: State<'_, DownloadState>,
    video_id: String,
    url: String,
    thumb_url: Option<String>,
    user_agent: Option<String>,
    ext: Option<String>,
) -> Result<DownloadResult, String> {
    if !valid_id(&video_id) {
        return Err("invalid track id".into());
    }
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("invalid audio url".into());
    }

    let ext = sanitize_ext(ext.as_deref());
    let dir = offline_dir(&app)?;
    remove_files_for(&dir, &video_id).await;

    let final_path = dir.join(format!("{video_id}.{ext}"));
    let part_path = dir.join(format!("{video_id}.{ext}.part"));

    // If the stream is already cached in stream_cache, copy it instead of re-downloading!
    if let Ok(cache_dir) = stream_cache_dir(&app) {
        if let Some((cached_path, cached_bytes)) = find_existing_audio(&cache_dir, &video_id).await {
            if fs::copy(&cached_path, &final_path).await.is_ok() {
                let mut thumb_path = None;
                if let Some(thumb) = thumb_url.filter(|t| t.starts_with("http")) {
                    let target = dir.join(format!("{video_id}.jpg"));
                    if fetch_thumbnail(&thumb, &target).await {
                        thumb_path = Some(target.to_string_lossy().to_string());
                    }
                }
                return Ok(DownloadResult {
                    video_id,
                    path: final_path.to_string_lossy().to_string(),
                    thumb_path,
                    bytes: cached_bytes,
                });
            }
        }
    }

    let cancel = Arc::new(AtomicBool::new(false));
    state
        .cancels
        .lock()
        .map_err(|_| "state poisoned".to_string())?
        .insert(video_id.clone(), cancel.clone());

    let result = fetch_audio(
        &app,
        &video_id,
        &url,
        user_agent.as_deref(),
        &part_path,
        &cancel,
        true,
    )
    .await;

    if let Ok(mut map) = state.cancels.lock() {
        map.remove(&video_id);
    }

    let bytes = match result {
        Ok(bytes) => bytes,
        Err(error) => {
            let _ = fs::remove_file(&part_path).await;
            return Err(error);
        }
    };

    fs::rename(&part_path, &final_path)
        .await
        .map_err(|e| e.to_string())?;

    let mut thumb_path = None;
    if let Some(thumb) = thumb_url.filter(|t| t.starts_with("http")) {
        let target = dir.join(format!("{video_id}.jpg"));
        if fetch_thumbnail(&thumb, &target).await {
            thumb_path = Some(target.to_string_lossy().to_string());
        }
    }

    Ok(DownloadResult {
        video_id,
        path: final_path.to_string_lossy().to_string(),
        thumb_path,
        bytes,
    })
}

/// Fetches a remote audio stream via Rust (bypassing WebView User-Agent,
/// Origin/Referer, and range throttling) into `$APPDATA/stream_cache/` so the
/// `<audio>` element can play it cleanly through `asset://`.
#[tauri::command]
async fn cache_stream_track(
    app: AppHandle,
    video_id: String,
    url: String,
    user_agent: Option<String>,
    ext: Option<String>,
) -> Result<DownloadResult, String> {
    if !valid_id(&video_id) {
        return Err("invalid track id".into());
    }
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("invalid audio url".into());
    }

    // 1. Check if already downloaded in offline_dir
    if let Ok(off_dir) = offline_dir(&app) {
        if let Some((path, bytes)) = find_existing_audio(&off_dir, &video_id).await {
            return Ok(DownloadResult {
                video_id,
                path: path.to_string_lossy().to_string(),
                thumb_path: None,
                bytes,
            });
        }
    }

    // 2. Check if already cached in stream_cache_dir
    let dir = stream_cache_dir(&app)?;
    if let Some((path, bytes)) = find_existing_audio(&dir, &video_id).await {
        return Ok(DownloadResult {
            video_id,
            path: path.to_string_lossy().to_string(),
            thumb_path: None,
            bytes,
        });
    }

    let ext = sanitize_ext(ext.as_deref());
    let final_path = dir.join(format!("{video_id}.{ext}"));
    let part_path = dir.join(format!("{video_id}.{ext}.part"));
    let cancel = Arc::new(AtomicBool::new(false));

    let bytes = match fetch_audio(
        &app,
        &video_id,
        &url,
        user_agent.as_deref(),
        &part_path,
        &cancel,
        false,
    )
    .await
    {
        Ok(b) => b,
        Err(e) => {
            let _ = fs::remove_file(&part_path).await;
            return Err(e);
        }
    };

    fs::rename(&part_path, &final_path)
        .await
        .map_err(|e| e.to_string())?;

    prune_stream_cache(&dir, MAX_STREAM_CACHE_FILES).await;

    Ok(DownloadResult {
        video_id,
        path: final_path.to_string_lossy().to_string(),
        thumb_path: None,
        bytes,
    })
}

/// Saves user-imported local audio bytes (`.mp3`, `.flac`, `.wav`, `.m4a`, `.ogg`)
/// into `$APPDATA/offline/{video_id}.{ext}` so local files play natively offline.
#[tauri::command]
async fn save_imported_audio(
    app: AppHandle,
    video_id: String,
    bytes: Vec<u8>,
    ext: Option<String>,
) -> Result<DownloadResult, String> {
    if !valid_id(&video_id) {
        return Err("invalid track id".into());
    }
    if bytes.is_empty() {
        return Err("audio file is empty".into());
    }
    let ext = sanitize_ext(ext.as_deref());
    let dir = offline_dir(&app)?;
    remove_files_for(&dir, &video_id).await;

    let final_path = dir.join(format!("{video_id}.{ext}"));
    fs::write(&final_path, &bytes)
        .await
        .map_err(|e| e.to_string())?;

    Ok(DownloadResult {
        video_id,
        path: final_path.to_string_lossy().to_string(),
        thumb_path: None,
        bytes: bytes.len() as u64,
    })
}

#[tauri::command]
async fn clear_stream_cache(app: AppHandle) -> Result<(), String> {
    let dir = stream_cache_dir(&app)?;
    if let Ok(mut entries) = fs::read_dir(&dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let _ = fs::remove_file(entry.path()).await;
        }
    }
    Ok(())
}

#[tauri::command]
fn cancel_download(state: State<'_, DownloadState>, video_id: String) {
    if let Ok(map) = state.cancels.lock() {
        if let Some(flag) = map.get(&video_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }
}

#[tauri::command]
async fn delete_download(app: AppHandle, video_id: String) -> Result<(), String> {
    if !valid_id(&video_id) {
        return Err("invalid track id".into());
    }
    let dir = offline_dir(&app)?;
    remove_files_for(&dir, &video_id).await;
    Ok(())
}

#[tauri::command]
async fn list_downloads(app: AppHandle) -> Result<Vec<ListedFile>, String> {
    let dir = offline_dir(&app)?;
    let mut out = Vec::new();

    let mut entries = fs::read_dir(&dir).await.map_err(|e| e.to_string())?;
    while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
        let path = entry.path();
        let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
            continue;
        };
        let ext_lower = ext.to_ascii_lowercase();
        if !AUDIO_EXTS.contains(&ext_lower.as_str()) {
            continue; // skips .jpg thumbnails and .part leftovers
        }
        let Some(id) = path.file_stem().and_then(|s| s.to_str()) else {
            continue;
        };
        if !valid_id(id) {
            continue;
        }

        let bytes = entry.metadata().await.map(|m| m.len()).unwrap_or(0);
        let thumb = dir.join(format!("{id}.jpg"));
        out.push(ListedFile {
            video_id: id.to_string(),
            path: path.to_string_lossy().to_string(),
            thumb_path: thumb.exists().then(|| thumb.to_string_lossy().to_string()),
            bytes,
        });
    }

    // Clean up interrupted downloads from a previous run.
    if let Ok(mut leftovers) = fs::read_dir(&dir).await {
        while let Ok(Some(entry)) = leftovers.next_entry().await {
            if entry.file_name().to_string_lossy().ends_with(".part") {
                let _ = fs::remove_file(entry.path()).await;
            }
        }
    }

    Ok(out)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .manage(DownloadState::default())
        .invoke_handler(tauri::generate_handler![
            download_track,
            cache_stream_track,
            save_imported_audio,
            clear_stream_cache,
            cancel_download,
            delete_download,
            list_downloads
        ])
        .run(tauri::generate_context!())
        .expect("error while running DVibes");
}
