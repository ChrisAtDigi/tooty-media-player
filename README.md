# 🍿 Tooty

> A Netflix-style local media player for Samsung Smart TVs (Tizen OS)

Tooty is a personal Tizen web application that transforms your external HDD into a beautifully browsable streaming library — directly on your Samsung TV. No internet subscription, no server, no cloud. Just your content, presented properly.

---

## Features

- 🔍 **Auto-discovery** of connected external HDD / USB storage on launch
- 📂 **Category detection** from your existing folder structure (Movies, Series, Audiobooks, Music)
- 🎬 **TMDB metadata enrichment** — poster art, synopses, ratings, genre tags, cast (fetched once, cached forever)
- ⏯️ **Resume watching** — playback position saved every 10 seconds
- 🎮 **Full D-pad / remote navigation** — no mouse or keyboard required
- 🔎 **Search** across your entire library
- 📺 **AVPlay video engine** — MKV, MP4, AVI + SRT/ASS subtitle support

---

## Folder Structure on Your HDD

Tooty reads your existing folder layout. No re-organisation needed.

```
ROOT/
├── Movies/
│   ├── The Dark Knight (2008)/
│   │   ├── The Dark Knight [1080p].mkv
│   │   └── The Dark Knight.en.srt
│   └── The Hunger Games/
│       ├── The Hunger Games (2012) [1080p].mkv
│       └── Catching Fire (2013) [1080p].mkv
├── Series/
│   └── Breaking Bad/
│       ├── Season 1/
│       │   └── S01E01 - Pilot.mkv
│       └── Season 2/
├── Audiobooks/
│   └── Atomic Habits - James Clear/
│       └── Atomic Habits.mp3
└── Music/
    └── Artist Name/
        └── Album Name/
            └── 01 - Track Name.mp3
```

### Naming Conventions

| Pattern | Example | Notes |
|---|---|---|
| `Folder: Title (Year)` | `The Dark Knight (2008)` | Best for TMDB matching |
| `File: Title [Quality]` | `The Dark Knight [1080p].mkv` | Quality tag auto-stripped |
| `File: Title (Year) [Quality]` | `Catching Fire (2013) [1080p].mkv` | Works in grouped folders |
| `Series: SxxExx` | `S01E01 - Pilot.mkv` | Standard series episode naming |

---

## Optional: Sidecar Override

For titles TMDB can't match, drop an `info.json` in the title folder:

```json
{
  "title": "My Custom Title",
  "year": 2023,
  "genre": ["Documentary"],
  "description": "Description here",
  "poster": "poster.jpg",
  "tmdb_id": null
}
```

---

## Tech Stack

| | |
|---|---|
| Platform | Samsung Smart TV (Tizen OS 4.0+) |
| UI | React + Vite |
| Styling | Tailwind CSS |
| Navigation | js-spatial-navigation |
| Playback | Tizen AVPlay API |
| Filesystem | tizen.filesystem API |
| Metadata | TMDB API (free) |
| Storage | localStorage (metadata cache + progress) |

---

## Development Setup

### Prerequisites
- [Tizen Studio](https://developer.tizen.org/development/tizen-studio/download) (free)
- Node.js 18+
- Samsung Developer Account (free — for signing certificate)

### Install dependencies
```bash
npm install
```

### Dev build (watch mode)
```bash
npm run dev
```

### Production build (for TV deployment)
```bash
npm run build
```
Output goes to `/dist` — this is what gets sideloaded to the TV.

### Enable Developer Mode on TV
1. Settings → Apps → type `12345` on remote
2. Toggle **Developer Mode** ON
3. Enter your PC's local IP address
4. Reboot TV

### Deploy to TV
1. Open Tizen Studio → Device Manager → Add TV by IP
2. Right-click project → **Run As → Tizen Web Application**
3. App appears in TV app tray

> **Note:** Developer Mode expires after ~50 hours. Get a free Samsung Developer Certificate to remove this restriction permanently.

---

## Project Structure

```
tooty/
├── src/
│   ├── components/       # Shared UI components (Card, Row, Modal, etc.)
│   ├── screens/          # Screen components
│   │   ├── HomeScreen.jsx
│   │   ├── BrowseScreen.jsx
│   │   ├── DetailScreen.jsx
│   │   ├── PlayerScreen.jsx
│   │   ├── SearchScreen.jsx
│   │   └── SettingsScreen.jsx
│   ├── hooks/
│   │   ├── useLibrary.js     # Media library state + scan logic
│   │   ├── usePlayer.js      # AVPlay wrapper + progress tracking
│   │   └── useNavigation.js  # D-pad focus management
│   ├── services/
│   │   ├── scanner.js        # tizen.filesystem traversal
│   │   ├── tmdb.js           # TMDB API client
│   │   ├── metadataCache.js  # localStorage read/write
│   │   └── filenameParser.js # Title/year/quality/episode extraction
│   ├── utils/
│   │   └── formatters.js     # Time, file size, etc.
│   └── App.jsx
├── tizen/
│   ├── config.xml            # Tizen app manifest
│   └── icon.png
├── public/
│   └── index.html
├── vite.config.js
├── package.json
└── README.md
```

---

## Roadmap

- **v1 Beta** — Core library, TMDB metadata, video playback, D-pad nav, search
- **v1.1** — Music player with album art view, audiobook chapter support
- **v1.2** — Multiple storage device support
- **v2.0** — Network share (SMB/NFS) support

---

## License

Personal use only. Not for distribution.
