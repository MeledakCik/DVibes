# DVibes — Your Midnight Music Space

A lightweight, ad-free, cozy desktop music player built with **Tauri (Rust)**, **React 18**, **Vite**, **TypeScript**, **Tailwind CSS**, and **Howler.js**.

## Core Features
- **100% Free & Ad-Free Streaming via Audius API**:
  - Search endpoint: `https://discoveryprovider.audius.co/v1/tracks/search?query=lofi&app_name=DVIBES`
  - Trending endpoint: `https://discoveryprovider.audius.co/v1/tracks/trending?app_name=DVIBES`
  - Stream URL format: `https://discoveryprovider.audius.co/v1/tracks/{track_id}/stream?app_name=DVIBES`
- **Local Audio Playback**: Import and play local `.mp3`, `.flac`, and `.wav` files directly from your computer.
- **Bonus Jamendo Lo-Fi Integration**: Toggle between Audius and Jamendo Chill streams.
- **Web Audio Ambient Stems**: Layer live 432Hz binaural drones, porch rain, and vinyl tape warmth over any track.
- **Midnight Sanctuary Design System**: Muted dark surfaces (`#121214`, `#18181C`, `#1E1E24`) paired with pastel lavender (`#B8A9C9`), dusty blue (`#A9B5C9`), and pale sage (`#A9C9B8`).

## Quick Start

```bash
# Install dependencies
npm install

# Run in browser development mode
npm run dev

# Or launch the native lightweight Tauri desktop window
npm run tauri dev
```
