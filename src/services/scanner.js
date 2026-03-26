/**
 * scanner.js
 *
 * Traverses the Tizen filesystem to build a structured media library.
 *
 * Entry point: scanStorage(rootPath)
 *   → discovers Movies, Series, Audiobooks, Music folders
 *   → returns a LibraryResult { movies, series, audiobooks, music }
 *
 * In browser dev mode (tizen undefined), fetches from the Vite dev server's
 * /api/library endpoint (served by scripts/dev-scanner.js) instead of
 * returning empty arrays.
 */

import {
  parseFolder,
  parseFilename,
  parseSubtitle,
  isVideoFile,
  isAudioFile,
  isSubtitleFile,
} from './filenameParser.js'

// Top-level folder names to scan (case-insensitive match)
const CATEGORY_FOLDERS = {
  movies:     ['movies', 'movie', 'films', 'film'],
  series:     ['series', 'tv', 'tv shows', 'shows', 'television'],
  audiobooks: ['audiobooks', 'audiobook', 'books', 'audio books'],
  music:      ['music', 'audio', 'albums'],
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scan a storage root path and return the structured library.
 *
 * @param {string} rootPath  — Tizen virtual path, e.g. "removable1://"
 * @returns {Promise<LibraryResult>}
 *
 * LibraryResult: {
 *   movies:     MovieItem[]
 *   series:     SeriesItem[]
 *   audiobooks: AudiobookItem[]
 *   music:      MusicItem[]
 *   scannedAt:  number  (timestamp)
 * }
 */
export async function scanStorage(rootPath) {
  // In browser dev mode, delegate to the Vite dev server's filesystem API
  if (typeof tizen === 'undefined') {
    try {
      const encoded = encodeURIComponent(rootPath)
      const res = await fetch(`/api/library?root=${encoded}`)
      if (res.ok) return await res.json()
    } catch (err) {
      console.warn('[scanner] Dev API unavailable, returning empty library:', err)
    }
    return { movies: [], series: [], audiobooks: [], music: [], scannedAt: Date.now() }
  }

  const topDirs = await listDirectory(rootPath)

  const result = {
    movies: [],
    series: [],
    audiobooks: [],
    music: [],
    scannedAt: Date.now(),
  }

  for (const entry of topDirs) {
    if (!entry.isDirectory) continue
    const category = detectCategory(entry.name)
    if (!category) continue

    switch (category) {
      case 'movies':
        result.movies = await scanMoviesFolder(entry.fullPath)
        break
      case 'series':
        result.series = await scanSeriesFolder(entry.fullPath)
        break
      case 'audiobooks':
        result.audiobooks = await scanAudiobooksFolder(entry.fullPath)
        break
      case 'music':
        result.music = await scanMusicFolder(entry.fullPath)
        break
    }
  }

  return result
}

// ─── Category scanners ────────────────────────────────────────────────────────

/**
 * Scan the Movies folder.
 * Supports two layouts:
 *   1. Title folder per film:  Movies/The Dark Knight (2008)/film.mkv
 *   2. Grouped folder:         Movies/The Hunger Games/Catching Fire (2013).mkv
 */
async function scanMoviesFolder(path) {
  const movies = []
  const titleDirs = await listDirectory(path)

  for (const dir of titleDirs) {
    if (!dir.isDirectory) continue

    const folderMeta = parseFolder(dir.name)
    const children = await listDirectory(dir.fullPath)

    const videoFiles = children.filter(f => !f.isDirectory && isVideoFile(f.name))
    const subtitleFiles = children.filter(f => !f.isDirectory && isSubtitleFile(f.name))

    if (folderMeta.isGrouped) {
      // Grouped folder — each video file is a separate film
      for (const file of videoFiles) {
        const fileMeta = parseFilename(file.name)
        const subs = subtitleFiles
          .filter(s => s.name.startsWith(stripExt(file.name)))
          .map(s => ({ path: s.fullPath, ...parseSubtitle(s.name) }))

        movies.push({
          id: pathToId(file.fullPath),
          title: fileMeta.title || folderMeta.title,
          year: fileMeta.year,
          quality: fileMeta.quality,
          filePath: file.fullPath,
          folderPath: dir.fullPath,
          subtitles: subs,
          sidecarInfo: null,  // loaded separately if info.json present
        })
      }
    } else {
      // Single-title folder — all videos belong to one film (e.g. extras)
      // Primary video is the largest file or the first one
      const primaryFile = videoFiles[0]
      if (!primaryFile) continue

      const sidecar = await loadSidecar(dir.fullPath)
      const subs = subtitleFiles.map(s => ({
        path: s.fullPath,
        ...parseSubtitle(s.name),
      }))

      movies.push({
        id: pathToId(dir.fullPath),
        title: sidecar?.title ?? folderMeta.title,
        year: sidecar?.year ?? folderMeta.year,
        quality: parseFilename(primaryFile.name).quality,
        filePath: primaryFile.fullPath,
        folderPath: dir.fullPath,
        subtitles: subs,
        sidecarInfo: sidecar,
      })
    }
  }

  return movies
}

/**
 * Scan the Series folder.
 * Layout: Series/Show Name/Season N/S01E01 - Title.mkv
 */
async function scanSeriesFolder(path) {
  const shows = []
  const showDirs = await listDirectory(path)

  for (const showDir of showDirs) {
    if (!showDir.isDirectory) continue

    const showMeta = parseFolder(showDir.name)
    const sidecar = await loadSidecar(showDir.fullPath)
    const seasonDirs = await listDirectory(showDir.fullPath)

    const seasons = []

    for (const seasonDir of seasonDirs) {
      if (!seasonDir.isDirectory) continue
      // Accept "Season N", "S01", "Season 1", etc.
      if (!/season|^s\d+/i.test(seasonDir.name)) continue

      const seasonNumber = extractSeasonNumber(seasonDir.name)
      const episodeFiles = await listDirectory(seasonDir.fullPath)
      const episodes = []

      for (const file of episodeFiles) {
        if (file.isDirectory || !isVideoFile(file.name)) continue
        const epMeta = parseFilename(file.name)
        if (epMeta.type !== 'episode') continue

        episodes.push({
          id: pathToId(file.fullPath),
          title: epMeta.title,
          season: epMeta.season ?? seasonNumber,
          episode: epMeta.episode,
          episodeEnd: epMeta.episodeEnd,
          quality: epMeta.quality,
          filePath: file.fullPath,
        })
      }

      // Sort episodes numerically
      episodes.sort((a, b) => a.episode - b.episode)

      if (episodes.length > 0) {
        seasons.push({ seasonNumber, episodes })
      }
    }

    seasons.sort((a, b) => a.seasonNumber - b.seasonNumber)

    if (seasons.length > 0 || sidecar) {
      shows.push({
        id: pathToId(showDir.fullPath),
        title: sidecar?.title ?? showMeta.title,
        year: sidecar?.year ?? showMeta.year,
        folderPath: showDir.fullPath,
        seasons,
        sidecarInfo: sidecar,
      })
    }
  }

  return shows
}

/**
 * Scan the Audiobooks folder.
 * Layout: Audiobooks/Title - Author/chapter.mp3
 */
async function scanAudiobooksFolder(path) {
  const books = []
  const bookDirs = await listDirectory(path)

  for (const dir of bookDirs) {
    if (!dir.isDirectory) continue

    const sidecar = await loadSidecar(dir.fullPath)
    const files = await listDirectory(dir.fullPath)
    const audioFiles = files
      .filter(f => !f.isDirectory && isAudioFile(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

    if (audioFiles.length === 0) continue

    // Parse title/author from folder name — common pattern: "Title - Author"
    const dashIdx = dir.name.indexOf(' - ')
    const bookTitle = dashIdx > -1
      ? dir.name.slice(0, dashIdx).trim()
      : dir.name.trim()
    const author = dashIdx > -1
      ? dir.name.slice(dashIdx + 3).trim()
      : null

    books.push({
      id: pathToId(dir.fullPath),
      title: sidecar?.title ?? bookTitle,
      author: author,
      folderPath: dir.fullPath,
      chapters: audioFiles.map((f, i) => ({
        id: pathToId(f.fullPath),
        index: i,
        filename: f.name,
        filePath: f.fullPath,
      })),
      sidecarInfo: sidecar,
    })
  }

  return books
}

/**
 * Scan the Music folder.
 * Layout: Music/Artist/Album/01 - Track.mp3
 */
async function scanMusicFolder(path) {
  const artists = []
  const artistDirs = await listDirectory(path)

  for (const artistDir of artistDirs) {
    if (!artistDir.isDirectory) continue

    const albumDirs = await listDirectory(artistDir.fullPath)
    const albums = []

    for (const albumDir of albumDirs) {
      if (!albumDir.isDirectory) continue

      const files = await listDirectory(albumDir.fullPath)
      const tracks = files
        .filter(f => !f.isDirectory && isAudioFile(f.name))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

      if (tracks.length === 0) continue

      albums.push({
        id: pathToId(albumDir.fullPath),
        title: albumDir.name,
        folderPath: albumDir.fullPath,
        tracks: tracks.map((f, i) => ({
          id: pathToId(f.fullPath),
          index: i,
          filename: f.name,
          filePath: f.fullPath,
        })),
      })
    }

    if (albums.length > 0) {
      artists.push({
        id: pathToId(artistDir.fullPath),
        name: artistDir.name,
        folderPath: artistDir.fullPath,
        albums,
      })
    }
  }

  return artists
}

// ─── Tizen filesystem wrappers ────────────────────────────────────────────────

/**
 * List the contents of a directory via tizen.filesystem.
 * Returns an array of { name, fullPath, isDirectory }.
 *
 * Falls back to an empty array on any error.
 */
function listDirectory(path) {
  return new Promise((resolve) => {
    if (typeof tizen === 'undefined') {
      // Browser dev mode — return empty
      resolve([])
      return
    }

    try {
      tizen.filesystem.resolve(
        path,
        (dir) => {
          dir.listFiles(
            (files) => {
              resolve(
                files.map(f => ({
                  name: f.name,
                  fullPath: f.fullPath,
                  isDirectory: f.isDirectory,
                }))
              )
            },
            () => resolve([])
          )
        },
        () => resolve([],),
        'r'
      )
    } catch {
      resolve([])
    }
  })
}

/**
 * Load and parse an info.json sidecar file from a folder, if present.
 * Returns the parsed object or null.
 */
function loadSidecar(folderPath) {
  return new Promise((resolve) => {
    if (typeof tizen === 'undefined') {
      resolve(null)
      return
    }

    const infoPath = `${folderPath}/info.json`

    try {
      tizen.filesystem.resolve(
        infoPath,
        (file) => {
          try {
            const stream = file.openStream('r', 'UTF-8')
            let content = ''
            while (!stream.eof) content += stream.read(1024)
            stream.close()
            resolve(JSON.parse(content))
          } catch {
            resolve(null)
          }
        },
        () => resolve(null),
        'r'
      )
    } catch {
      resolve(null)
    }
  })
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function detectCategory(folderName) {
  const lower = folderName.toLowerCase().trim()
  for (const [category, aliases] of Object.entries(CATEGORY_FOLDERS)) {
    if (aliases.includes(lower)) return category
  }
  return null
}

function extractSeasonNumber(dirName) {
  const m = dirName.match(/\d+/)
  return m ? parseInt(m[0], 10) : 1
}

/**
 * Convert a file path to a stable, localStorage-safe ID string.
 * Uses a simple hash of the path.
 */
export function pathToId(path) {
  let hash = 0
  for (let i = 0; i < path.length; i++) {
    hash = (hash * 31 + path.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}

function stripExt(filename) {
  return filename.replace(/\.[^.]+$/, '')
}
