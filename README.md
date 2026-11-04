# DVibes v4.2 — App Native (Android · iOS · macOS · Windows) + Offline Vault & Local Import

DVibes menggabungkan arsitektur **Tauri 2 (serverless static export)** yang konsisten untuk Desktop & Mobile dengan fitur lengkap **Offline Vault, Impor Musik/LRC Lokal, Ambient Soundscape Synthesizer, dan Multi-Client Stream Failover**.

## Apa yang Sudah Diperbaiki & Ditambahkan

1. **Perbaikan Pemutaran Lagu (Multi-Client & Auto-Failover)**:
   - **Multi-Client InnerTube (`lib/api/innertube.ts`)**: Menggunakan rotasi 4 profil klien (`ANDROID_VR` 1.60.19 bebas `poToken`, `IOS` 19.45.4, `ANDROID` 19.44.38, dan `TVHTML5_SIMPLY_EMBEDDED_PLAYER`) sehingga tidak lagi gagal saat satu klien dibatasi YouTube.
   - **Perbaikan URL Invidious (`lib/api/invidious.ts`)**: URL mentah `googlevideo.com` dari Invidious terkunci ke IP server Invidious (menyebabkan error `403 Forbidden` di perangkat pengguna). Sekarang memprioritaskan endpoint proxy `/latest_version?id=...&itag=...&local=true` diikuti kandidat cadangan.
   - **Native Stream Caching di Rust (`src-tauri/src/lib.rs` — `cache_stream_track`)**: Di dalam aplikasi Tauri, stream `googlevideo.com` diambil langsung oleh Rust menggunakan *User-Agent* klien asli dan *ranged chunks* 2 MB ke `$APPDATA/stream_cache/` lalu diputar lewat protokol lokal `asset://` (bebas error 403/CORS WebView).
   - **Auto-Failover Antar Provider (`AudioProvider`)**: Jika satu URL stream gagal dimuat oleh `<audio>`, player otomatis mencoba kandidat URL berikutnya (`InnerTube` → `Piped` → `Invidious` → fallback `Audius` 320 kbps MP3 / `iTunes` M4A) sebelum menampilkan pesan error.

2. **Impor Musik Lokal & File Lirik `.LRC` (`offline-vault.ts`, `offline-store.ts`, `offline-view.tsx`)**:
   - Mendukung drag-and-drop maupun pemilih file untuk `.mp3`, `.flac`, `.wav`, `.m4a`, `.ogg`, `.aac`, `.opus` serta file lirik `.lrc` / `.txt`.
   - **Auto-Pairing `.mp3` + `.lrc`**: Pilih `Lagu.mp3` dan `Lagu.lrc` sekaligus untuk memasangkan lirik tersinkronisasi secara otomatis.
   - **Parser ID3v2 Asli**: Membaca judul, artis, album, cover art bawaan (APIC), durasi, dan bitrate asli dari file audio lokal, lalu menyimpannya di IndexedDB + `$APPDATA/offline/` (Tauri).
   - **Impor / Paste `.LRC` di Halaman Lirik**: Tombol **Import .LRC** dan **Paste LRC** langsung di panggung lirik untuk lagu apa pun (baik lagu online maupun lokal).

3. **Data Audio Jujur + DSP Tuning & Ambient Stems Asli (`native-bridge.ts`)**:
   - Label palsu/statis dihapus dan diganti dengan **telemetri codec & bitrate nyata** dari stream/file yang sedang diputar (mis. `AAC / M4A · 129 kbps`, `FLAC · 940 kbps`, `MP3 · 320 kbps`).
   - **Pitch Tuning Asli (`440Hz` · `432Hz` · `528Hz`)**: Mengubah rasio frekuensi pemutaran `<audio>` (`preservesPitch = false`) secara nyata.
   - **Procedural Web Audio Ambient Stems (`Rain`, `Vinyl`, `Fire`, `Wind`)**: Disintesis secara real-time menggunakan Web Audio API tanpa butuh koneksi internet.

4. **Pemutaran Layar Mati (Background Keep-Alive) & Fullscreen Player**:
   - Menambahkan pengelolaan `WakeLock`, *Web Audio keep-alive*, `MediaSession`, serta injeksi izin `WAKE_LOCK` & `FOREGROUND_SERVICE` otomatis pada workflow build APK Android.
   - Menambahkan **Fullscreen Sanctuary Player** (bisa dibuka dari tombol Maximize di desktop atau tap mini-player di HP, lengkap dengan *swipe-down to close*).

5. **Pembersihan File Server Warisan**:
   - Folder `server/` (`yt-dlp`), `app/api/*`, `legacy-vite/`, dan `lib/api/ytdlp-*.ts` yang sebelumnya mengganggu `next build` (`output: 'export'`) dan `tsc --noEmit` sudah dibersihkan sepenuhnya.

## Cara Build Otomatis lewat GitHub Actions (Tanpa Install Apa Pun di Laptop)

1. Upload seluruh isi folder ini ke repositori GitHub.
2. Buka tab **Actions → "Build DVibes (Windows, macOS, Android, iOS)" → Run workflow**.
3. Unduh hasil build di bagian **Artifacts**:
   - `dvibes-windows-latest` (`.exe` / `.msi`)
   - `dvibes-macos-latest` (`.dmg` universal)
   - `dvibes-android` (`.apk` siap pasang di Android)

## Build Lokal (Opsional)

```bash
npm install
npm run typecheck        # verifikasi TypeScript
npm run tauri:dev        # jalankan app desktop (Windows / macOS / Linux)
npm run tauri:build      # buat installer desktop
```

Atau klik dua kali `Run-DVibes-Windows.bat` (Windows) / `Run-DVibes-macOS.command` (macOS).
