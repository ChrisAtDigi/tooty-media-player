# Tooty Media Player - Development Progress

**Last updated:** 2026-03-26
**Repo:** https://github.com/ChrisAtDigi/tooty-media-player
**Platform:** Samsung Smart TV / Tizen OS 4.0+ / React + Vite
**Current state:** Functional browser-dev build with real library scanning, TMDB enrichment/caching, TV-style navigation, sidebar routing, series season grouping, and working production build output.

---

## What Tooty Is

Tooty is a local-first media player for Samsung Smart TVs that turns an external HDD/USB drive into a TV-friendly browsing experience.

Current project goals:
- Scan an attached drive automatically
- Build a structured library from existing folders
- Enrich titles with TMDB metadata
- Support TV remote navigation with no mouse/keyboard
- Play local media with browser fallback during development and AVPlay on Tizen

---

## Current Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | React 18 + Vite | ESM project |
| Routing | `react-router-dom` v6 | `HashRouter` for Tizen `file://` compatibility |
| Styling | Tailwind CSS v3 | TV-first utility setup |
| Navigation | `js-spatial-navigation` | D-pad / remote focus movement |
| Playback | HTML5 `<video>` + Tizen AVPlay path | Browser fallback works now |
| Metadata | TMDB v3 API | Search, details, seasons, image paths |
| Storage | `localStorage` | Device cache, TMDB cache, lookup cache, progress |

---

## Actual Project Structure

```text
tooty-media-player/
├── src/
│   ├── assets/
│   │   └── images/
│   │       └── tooty-logo-transparent.png
│   ├── components/
│   │   ├── FocusRing.jsx
│   │   └── SidebarNav.jsx
│   ├── context/
│   │   └── LibraryContext.jsx
│   ├── hooks/
│   │   └── useNavigation.js
│   ├── screens/
│   │   ├── HomeScreen.jsx
│   │   ├── BrowseScreen.jsx
│   │   ├── DetailScreen.jsx
│   │   ├── PlayerScreen.jsx
│   │   ├── SearchScreen.jsx
│   │   └── SettingsScreen.jsx
│   ├── services/
│   │   ├── deviceDetector.js
│   │   ├── filenameParser.js
│   │   ├── metadataCache.js
│   │   ├── scanner.js
│   │   └── tmdb.js
│   ├── App.jsx
│   ├── index.css
│   └── main.jsx
├── scripts/
│   └── dev-scanner.js
├── tizen/
│   └── config.xml
├── .env
├── .env.example
├── package.json
├── vite.config.js
└── progress.md
```

---

## Completed Work

### 1. App Shell and TV Routing

Status: complete

- `HashRouter` is in place for Tizen-friendly routing.
- The app now renders inside a shared shell with a persistent left sidebar.
- Sidebar routes:
  - Home
  - Movies
  - Series
  - Books
  - Music
- Sidebar branding now uses `src/assets/images/tooty-logo-transparent.png`.

Relevant files:
- `src/main.jsx`
- `src/App.jsx`
- `src/components/SidebarNav.jsx`

### 2. Remote Navigation and Focus Infrastructure

Status: complete and in active use

- `useNavigation.js` registers Tizen remote keys and sets up `js-spatial-navigation`.
- `FocusRing.jsx` is used as the standard focusable wrapper.
- Focus styling is centralized in CSS via `.sn-focused`.
- Additional visual scaling on focus/hover is now applied to cards and result items.

Relevant files:
- `src/hooks/useNavigation.js`
- `src/components/FocusRing.jsx`
- `src/index.css`

### 3. Filesystem Scanning

Status: complete for the current core flow

`scanner.js` builds a structured library from drive contents.

Supported categories:
- Movies
- Series
- Audiobooks
- Music

Supported patterns:
- Movies in title folders
- Grouped movie collections
- Series with season folders
- Audiobooks with chapter audio files
- Music artist -> album -> tracks
- Optional `info.json` sidecars

Development mode:
- Browser dev mode uses `scripts/dev-scanner.js` through `/api/library`
- `VITE_DEV_ROOT=D:/` is currently active in `.env`

Relevant files:
- `src/services/scanner.js`
- `scripts/dev-scanner.js`
- `src/services/deviceDetector.js`

### 4. Device Detection and Library Caching

Status: complete, with dev-mode rescan behavior improved

- Device snapshots are cached under `tooty:device:<key>`.
- On Tizen, the app reuses the cached library for the same known device unless a rescan is forced.
- In browser dev mode, `needsScan()` now always returns `true`, so `D:/` changes are picked up on reload.
- This was added specifically to fix stale title/card data after renaming files on disk.

Relevant files:
- `src/services/deviceDetector.js`
- `src/context/LibraryContext.jsx`

### 5. TMDB Integration

Status: implemented and significantly improved

TMDB support now includes:
- Movie search
- TV search
- Movie detail fetch
- TV detail fetch
- TV season detail fetch
- Poster/backdrop URL helpers

Enrichment currently stores onto library items:
- `tmdbId`
- `posterPath`
- `backdropPath`
- `overview`
- `rating`
- `genres`
- `genreIds`

Episode title improvement:
- When a TV show matches correctly on TMDB, selected season data is fetched and cached.
- Episode names from TMDB replace noisy parsed names like codec/release tags where possible.

Relevant files:
- `src/services/tmdb.js`
- `src/context/LibraryContext.jsx`
- `src/screens/DetailScreen.jsx`

### 6. TMDB Caching and Request Reduction

Status: implemented

Caching now exists at multiple layers:

Library/device cache:
- Cached library snapshots in `localStorage`

Metadata cache:
- TMDB detail payloads cached under `tooty:meta:<type>:<id>`

Lookup cache:
- TMDB search lookups cached under `tooty:lookup:<type>:<key>`
- Both successful matches and misses are cached

Progress cache:
- Playback progress cached under `tooty:progress:<mediaId>`

Important current behavior:
- The app should not re-search or re-fetch TMDB details for already-enriched items on every app open.
- Only items missing core TMDB data should trigger enrichment.
- Season title lookups happen when viewing a matched series/season and are cached afterward.

What is not explicitly cached by the app:
- Poster/backdrop image files themselves are not stored into app-managed local storage.
- Image URLs are cached by the web runtime/CDN behavior, not by a custom offline image cache.

Relevant files:
- `src/services/metadataCache.js`
- `src/services/tmdb.js`
- `src/context/LibraryContext.jsx`

### 7. Home Screen

Status: functional and iterated

The home screen now includes:
- Featured hero banner with title, year, overview, play, and more-info actions
- Continue Watching row
- Genre rows derived from TMDB genres already stored on library items
- Audiobooks row

Home screen behavior updates made in this session:
- Removed top-level `Movies` and `Series` rows from the home screen
- Genre rows restored after fixing an overly strict item-count filter
- Row scrollbar hidden
- Active row scales larger and is visually emphasized
- Cards scale up on focus/hover

Banner strategy:
- The hero uses already-known `backdropPath` from TMDB detail data
- No extra banner-specific TMDB API logic has been introduced

Relevant files:
- `src/screens/HomeScreen.jsx`
- `src/context/LibraryContext.jsx`
- `src/index.css`

### 8. Browse Screen

Status: functional

Browse supports:
- `/browse/:category`
- Movies
- Series
- Audiobooks
- Music

Capabilities:
- Sort by title ascending/descending
- Sort by year newest/oldest
- Handles music safely using artist/album-derived summary text instead of movie-only assumptions
- Card scale on focus/hover added

Relevant files:
- `src/screens/BrowseScreen.jsx`

### 9. Detail Screen

Status: functional for movies and series

Movie detail currently supports:
- Poster
- Backdrop
- Year
- Overview
- Genres
- Rating
- Cast
- Direct play action for movie files

Series detail currently supports:
- Season grouping
- Season selection strip
- Episode list for selected season
- Continue-progress indicators
- TMDB season title replacement where available

Series UX was changed from accordion-style to a more streaming-app-like season selector.

Relevant files:
- `src/screens/DetailScreen.jsx`

### 10. Player Screen

Status: working in browser fallback, Tizen path prepared

Browser dev path:
- Uses HTML5 `<video>`
- Tracks current time and duration
- Saves progress periodically

Tizen path:
- AVPlay path is wired structurally
- File URI resolution exists
- AVPlay open/prepare/play/seek/close flow is coded

Current player controls:
- Play/pause
- Back to exit
- Fast forward
- Rewind
- Progress saving

Relevant files:
- `src/screens/PlayerScreen.jsx`
- `src/services/metadataCache.js`

### 11. Search Screen

Status: functional

- D-pad-friendly on-screen keyboard
- Library search across:
  - movies
  - series
  - audiobooks
- Results render with posters/placeholders
- Result items now scale visually on focus/hover

Relevant files:
- `src/screens/SearchScreen.jsx`

### 12. Settings Screen

Status: functional

Available settings:
- View connected storage label and scan counts
- Rescan the current device
- Save TMDB API key override to localStorage
- Clear metadata cache
- Clear playback progress

Relevant files:
- `src/screens/SettingsScreen.jsx`

### 13. CSS / Layout Fixes

Status: improved during this session

Layout and UX fixes completed:
- Hide horizontal scrollbars for home shelves
- Add focus/hover scaling to cards/results
- Add `min-h-0` to routed flex layouts and scrollable containers
- Fix page scrolling on detail and related screens

Relevant files:
- `src/index.css`
- `src/App.jsx`
- `src/screens/HomeScreen.jsx`
- `src/screens/DetailScreen.jsx`
- `src/screens/BrowseScreen.jsx`
- `src/screens/SearchScreen.jsx`
- `src/screens/SettingsScreen.jsx`

---

## Current Runtime Flow

### Browser Dev Mode

1. App opens
2. `deviceDetector` resolves a dev device pointing at `D:/`
3. The library is rescanned from disk on load
4. Cached or newly scanned library is loaded into app state
5. TMDB enrichment runs only for items missing core metadata
6. UI updates as metadata becomes available

### Intended Tizen Flow

1. App opens
2. Detect connected removable storage
3. If known device and cached snapshot exist, reuse it
4. If new device or forced rescan, scan filesystem
5. Enrich missing metadata from TMDB in background
6. Reuse cached TMDB metadata and lookup results on future launches

---

## Current Local Storage Namespaces

| Prefix | Purpose |
|---|---|
| `tooty:device:<key>` | Cached scanned library per device |
| `tooty:meta:<type>:<id>` | Cached TMDB detail payloads |
| `tooty:lookup:<type>:<key>` | Cached TMDB search lookups and misses |
| `tooty:progress:<mediaId>` | Playback progress |
| `tooty:config:tmdbKey` | User-entered TMDB API key override |

---

## Known Gaps / Remaining Work

### High Priority

- Verify the real Tizen device flow end-to-end:
  - HDD detection
  - cached device reuse
  - TMDB enrichment behavior
  - AVPlay playback
- Validate that TV runtime HTTP image caching is acceptable in practice
- Confirm scroll/focus behavior across all screens on actual TV hardware

### Functional Gaps

- No dedicated detail/play flow for music yet
- Audiobooks exist in browse/home, but their deeper playback/detail UX still needs product decisions
- Search currently does not search music
- Genre-based browse routes do not exist yet; genres are shown on home only
- No child-safe / kiddy-lock mode yet
- No explicit poster/backdrop offline image cache yet

### Tizen-Specific Follow-Up

- Test AVPlay with real drive file paths on Samsung TV
- Confirm subtitle behavior and file URI handling
- Validate performance of TMDB image loading on TV hardware

---

## Current Design Decisions

### Metadata Strategy

- Use TMDB genres directly
- Do not invent a custom `Kids` genre bucket at this stage
- Child-safe mode will be a later feature and should rely on age/certification data rather than hand-made tags

### Banner Strategy

- Reuse cached TMDB `backdropPath`
- Avoid special-case banner API calls
- Fall back to non-image hero if backdrop is unavailable

### Series UX Strategy

- Group by season
- Show a season picker instead of dumping all episodes into one large list
- Pull canonical episode titles from TMDB season data when the show matches correctly

---

## Environment Notes

Current `.env` shape:

```bash
VITE_TMDB_API_KEY=<tmdb_v3_key>
VITE_TMDB_READ_ACCESS_TOKEN=<tmdb_v4_token>
VITE_DEV_ROOT=D:/
```

`.env.example` has placeholders for the same keys.

---

## Build Status

Current status:
- `npm run build` succeeds
- Vite production output is being generated successfully in `dist/`

This was verified repeatedly during this session after:
- sidebar/navigation work
- TMDB caching changes
- season title integration
- logo asset swap
- layout/scroll fixes
- home-row visibility fixes

---

## Session Summary: Major Changes Added During This Session

This session materially advanced the project beyond the previously documented state.

Changes completed:
- Added real persistent sidebar navigation shell
- Replaced sidebar text header with actual Tooty logo PNG
- Added TMDB genre persistence onto movies and series
- Added derived genre collections in shared state
- Displayed genre rows on the home screen
- Removed home `Movies` and `Series` rows from the top section
- Improved home shelf behavior and styling
- Improved season selection UX for series
- Added TMDB season-detail fetch and episode title replacement
- Added stricter TMDB caching for lookups and misses
- Prevented dev-mode `D:/` from staying stale after file renames
- Fixed multiple flex/scroll layout issues
- Added card/result focus scaling on multiple screens

---

## Overall Status

The project is no longer in scaffold/stub territory.

Current maturity:
- Real scan -> cache -> enrich -> browse loop exists
- Core UI routes exist and work in browser dev mode
- Production builds succeed
- Remaining work is mainly product completion, Tizen verification, and category/playback polish rather than foundational architecture
