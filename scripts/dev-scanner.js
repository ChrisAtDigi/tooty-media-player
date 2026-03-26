/**
 * dev-scanner.js
 *
 * Vite dev-only plugin that exposes a local HTTP endpoint:
 *   GET /api/library?root=D:/
 *
 * The browser-side scanner.js calls this endpoint in dev mode instead of
 * using the Tizen filesystem API (which is unavailable on a laptop).
 *
 * Returns a LibraryResult in the same shape as scanner.js produces on Tizen.
 */

import { readdir } from 'fs/promises'
import { join, extname } from 'path'
import {
  parseFolder,
  parseFilename,
  isVideoFile,
  isAudioFile,
} from '../src/services/filenameParser.js'

// ─── Category detection (mirrors scanner.js) ──────────────────────────────────

const CATEGORY_FOLDERS = {
  movies:     ['movies', 'movie', 'films', 'film'],
  series:     ['series', 'tv', 'tv shows', 'shows', 'television'],
  audiobooks: ['audiobooks', 'audiobook', 'books', 'audio books'],
  music:      ['music', 'audio', 'albums'],
}

function detectCategory(folderName) {
  const lower = folderName.toLowerCase().trim()
  for (const [cat, aliases] of Object.entries(CATEGORY_FOLDERS)) {
    if (aliases.includes(lower)) return cat
  }
  return null
}

// ─── Stable path-based ID (mirrors scanner.js) ────────────────────────────────

function pathToId(p) {
  let hash = 0
  for (let i = 0; i < p.length; i++) hash = (hash * 31 + p.charCodeAt(i)) >>> 0
  return hash.toString(36)
}

// ─── Filesystem helpers ───────────────────────────────────────────────────────

async function readDirEntries(dirPath) {
  try {
    const dirents = await readdir(dirPath, { withFileTypes: true })
    return dirents.map(d => ({
      name:        d.name,
      fullPath:    join(dirPath, d.name),
      isDirectory: d.isDirectory(),
    }))
  } catch {
    return []
  }
}

// ─── Category scanners ────────────────────────────────────────────────────────

/**
 * Scan the Movies folder.
 *
 * Handles:
 *   1. Single-title folder:  Movies/Title (Year)/film.mkv
 *   2. Grouped collection:   Movies/Collection/Title (Year)/film.mkv
 *                            Movies/Collection/title.mkv  (direct files)
 */
async function scanMovies(moviesPath) {
  const movies = []
  const topEntries = await readDirEntries(moviesPath)

  for (const entry of topEntries) {
    if (!entry.isDirectory) continue
    const folderMeta = parseFolder(entry.name)
    const children = await readDirEntries(entry.fullPath)

    if (folderMeta.isGrouped) {
      // Grouped folder — look for video files AND movie subdirs
      for (const child of children) {
        if (!child.isDirectory && isVideoFile(child.name)) {
          // Direct video file inside a collection folder
          const fileMeta = parseFilename(child.name)
          movies.push({
            id:         pathToId(child.fullPath),
            title:      fileMeta.title || folderMeta.title,
            year:       fileMeta.year,
            quality:    fileMeta.quality,
            filePath:   child.fullPath,
            folderPath: entry.fullPath,
            subtitles:  [],
            sidecarInfo: null,
          })
        } else if (child.isDirectory) {
          // Movie subdir inside collection (e.g. Harry Potter/Chamber of Secrets (2002) [1080p]/)
          const subMeta = parseFolder(child.name)
          const grandChildren = await readDirEntries(child.fullPath)
          const videoFile = grandChildren.find(g => !g.isDirectory && isVideoFile(g.name))
          if (!videoFile) continue
          movies.push({
            id:         pathToId(child.fullPath),
            title:      subMeta.title || child.name,
            year:       subMeta.year,
            quality:    parseFilename(videoFile.name).quality,
            filePath:   videoFile.fullPath,
            folderPath: child.fullPath,
            subtitles:  [],
            sidecarInfo: null,
          })
        }
      }
    } else {
      // Single-title folder — use first video file found
      const videoFile = children.find(c => !c.isDirectory && isVideoFile(c.name))
      if (!videoFile) continue
      movies.push({
        id:         pathToId(entry.fullPath),
        title:      folderMeta.title,
        year:       folderMeta.year,
        quality:    parseFilename(videoFile.name).quality,
        filePath:   videoFile.fullPath,
        folderPath: entry.fullPath,
        subtitles:  children
          .filter(c => !c.isDirectory && extname(c.name).match(/^\.(srt|ass|ssa|vtt|sub)$/i))
          .map(c => ({ path: c.fullPath, language: null })),
        sidecarInfo: null,
      })
    }
  }

  return movies
}

/**
 * Scan the Series folder.
 *
 * Handles two layouts:
 *   1. Standard:  Series/Show/Season N/S01E01.mkv
 *   2. Flat:      Series/Show/S01E01.mkv  (no Season subfolder)
 */
async function scanSeries(seriesPath) {
  const shows = []
  const showDirs = await readDirEntries(seriesPath)

  for (const showEntry of showDirs) {
    if (!showEntry.isDirectory) continue
    const showMeta = parseFolder(showEntry.name)
    const children = await readDirEntries(showEntry.fullPath)

    // Check for Season subdirectories
    const seasonDirs = children.filter(
      c => c.isDirectory && /season|^s\d+/i.test(c.name)
    )

    let seasons = []

    if (seasonDirs.length > 0) {
      // Standard structure
      for (const seasonEntry of seasonDirs) {
        const seasonNum = extractSeasonNumber(seasonEntry.name)
        const episodeFiles = await readDirEntries(seasonEntry.fullPath)
        const episodes = []

        for (const file of episodeFiles) {
          if (file.isDirectory || !isVideoFile(file.name)) continue
          const epMeta = parseFilename(file.name)
          if (epMeta.type !== 'episode') continue
          episodes.push({
            id:       pathToId(file.fullPath),
            title:    epMeta.title,
            season:   epMeta.season ?? seasonNum,
            episode:  epMeta.episode,
            quality:  epMeta.quality,
            filePath: file.fullPath,
          })
        }

        episodes.sort((a, b) => a.episode - b.episode)
        if (episodes.length > 0) seasons.push({ seasonNumber: seasonNum, episodes })
      }
    } else {
      // Flat structure — episodes directly in the show folder
      const episodeFiles = children.filter(c => !c.isDirectory && isVideoFile(c.name))
      const bySeason = new Map()

      for (const file of episodeFiles) {
        const epMeta = parseFilename(file.name)
        if (epMeta.type !== 'episode') continue
        const seasonNum = epMeta.season ?? 1
        if (!bySeason.has(seasonNum)) bySeason.set(seasonNum, [])
        bySeason.get(seasonNum).push({
          id:       pathToId(file.fullPath),
          title:    epMeta.title,
          season:   seasonNum,
          episode:  epMeta.episode,
          quality:  epMeta.quality,
          filePath: file.fullPath,
        })
      }

      for (const [seasonNum, eps] of [...bySeason.entries()].sort(([a], [b]) => a - b)) {
        seasons.push({
          seasonNumber: seasonNum,
          episodes:     eps.sort((a, b) => a.episode - b.episode),
        })
      }
    }

    seasons.sort((a, b) => a.seasonNumber - b.seasonNumber)

    if (seasons.length > 0) {
      shows.push({
        id:          pathToId(showEntry.fullPath),
        title:       showMeta.title,
        year:        showMeta.year,
        folderPath:  showEntry.fullPath,
        seasons,
        sidecarInfo: null,
      })
    }
  }

  return shows
}

/**
 * Scan the Audiobooks / Books folder.
 *
 * Handles:
 *   1. Flat:   Books/Title - Author/ch01.mp3
 *   2. Nested: Books/Collection/Sub-title/ch01.mp3
 */
async function scanAudiobooks(booksPath) {
  const books = []
  const bookDirs = await readDirEntries(booksPath)

  for (const entry of bookDirs) {
    if (!entry.isDirectory) continue

    const children = await readDirEntries(entry.fullPath)
    const audioFiles = children.filter(c => !c.isDirectory && isAudioFile(c.name))

    if (audioFiles.length > 0) {
      // Audio files directly in this folder
      const dashIdx = entry.name.indexOf(' - ')
      const bookTitle = dashIdx > -1 ? entry.name.slice(0, dashIdx).trim() : entry.name.trim()
      const author    = dashIdx > -1 ? entry.name.slice(dashIdx + 3).trim() : null

      books.push({
        id:          pathToId(entry.fullPath),
        title:       bookTitle,
        author,
        folderPath:  entry.fullPath,
        chapters:    audioFiles
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .map((f, i) => ({ id: pathToId(f.fullPath), index: i, filename: f.name, filePath: f.fullPath })),
        sidecarInfo: null,
      })
    } else {
      // Sub-collection (e.g. Dune - Audiobook Collection / 01 - Dune Saga / ch.mp3)
      const subDirs = children.filter(c => c.isDirectory)
      for (const sub of subDirs) {
        const subChildren = await readDirEntries(sub.fullPath)
        const subAudio = subChildren.filter(c => !c.isDirectory && isAudioFile(c.name))
        if (subAudio.length === 0) continue

        const dashIdx = sub.name.indexOf(' - ')
        const title  = dashIdx > -1 ? sub.name.slice(dashIdx + 3).trim() : sub.name.trim()
        const author = null

        books.push({
          id:          pathToId(sub.fullPath),
          title,
          author,
          folderPath:  sub.fullPath,
          chapters:    subAudio
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
            .map((f, i) => ({ id: pathToId(f.fullPath), index: i, filename: f.name, filePath: f.fullPath })),
          sidecarInfo: null,
        })
      }
    }
  }

  return books
}

// ─── Main scan entry point ────────────────────────────────────────────────────

async function scanDriveForLibrary(rootPath) {
  const result = {
    movies:     [],
    series:     [],
    audiobooks: [],
    music:      [],
    scannedAt:  Date.now(),
  }

  const topEntries = await readDirEntries(rootPath)

  for (const entry of topEntries) {
    if (!entry.isDirectory) continue
    const category = detectCategory(entry.name)
    if (!category) continue

    switch (category) {
      case 'movies':
        result.movies = await scanMovies(entry.fullPath)
        break
      case 'series':
        result.series = await scanSeries(entry.fullPath)
        break
      case 'audiobooks':
        result.audiobooks = await scanAudiobooks(entry.fullPath)
        break
      // music scanner can be added later
    }
  }

  return result
}

// ─── Vite plugin ─────────────────────────────────────────────────────────────

function extractSeasonNumber(dirName) {
  const m = dirName.match(/\d+/)
  return m ? parseInt(m[0], 10) : 1
}

export function devLibraryPlugin() {
  return {
    name: 'dev-library-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/library')) { next(); return }

        const url  = new URL(req.url, 'http://localhost')
        const root = url.searchParams.get('root') ?? 'D:/'

        try {
          const library = await scanDriveForLibrary(root)
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Access-Control-Allow-Origin', '*')
          res.end(JSON.stringify(library))
        } catch (err) {
          console.error('[dev-scanner] Error:', err)
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    },
  }
}
