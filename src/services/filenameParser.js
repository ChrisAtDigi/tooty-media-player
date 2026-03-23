/**
 * filenameParser.js
 *
 * Extracts structured metadata from real-world media filenames and folder names.
 *
 * Handles:
 *   - "The Dark Knight (2008)"              → folder with year
 *   - "The Dark Knight [1080p].mkv"         → file with quality tag, no year
 *   - "Catching Fire (2013) [1080p].mkv"    → title + year + quality in filename
 *   - "The Hunger Games"                    → bare folder (grouped collection)
 *   - "S01E01 - Pilot [1080p].mkv"          → series episode
 *   - "S01E01E02 - Double.mkv"              → multi-episode file
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const VIDEO_EXTENSIONS = new Set(['mkv', 'mp4', 'avi', 'mov', 'wmv', 'm4v', 'ts', 'vob'])
const AUDIO_EXTENSIONS = new Set(['mp3', 'flac', 'aac', 'm4a', 'ogg', 'wav', 'opus', 'm4b'])
const SUBTITLE_EXTENSIONS = new Set(['srt', 'ass', 'ssa', 'vtt', 'sub'])

// Quality tags to strip from titles — order matters (longest first to avoid partial matches)
const QUALITY_TAGS = [
  '2160p', '4k', 'uhd',
  '1080p', '1080i',
  '720p', '720i',
  '480p', '576p',
  'bluray', 'blu-ray', 'bdrip', 'brrip',
  'webrip', 'web-dl', 'webdl', 'web',
  'hdrip', 'hdtv', 'dvdrip', 'dvd',
  'hevc', 'x265', 'x264', 'h264', 'h265', 'av1',
  'hdr', 'hdr10', 'dolby', 'dts', 'aac', 'ac3',
  'proper', 'repack', 'extended', 'theatrical',
  'directors.cut', 'unrated',
]

// Regex: [tag] or (tag) — case insensitive
const BRACKET_QUALITY_RE = new RegExp(
  `[\\[\\(](${QUALITY_TAGS.join('|')})[\\]\\)]`,
  'gi'
)

// Regex: year in parentheses (1900–2099)
const YEAR_PAREN_RE = /\((\d{4})\)/

// Regex: year anywhere (looser, for filenames without parens)
const YEAR_LOOSE_RE = /\b(19\d{2}|20\d{2})\b/

// Regex: SxxExx[Exx] episode pattern
const EPISODE_RE = /[Ss](\d{1,2})[Ee](\d{2})(?:[Ee](\d{2}))?/

// Regex: file extension
const EXT_RE = /\.([a-z0-9]{2,4})$/i

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripExtension(name) {
  return name.replace(EXT_RE, '')
}

function getExtension(name) {
  const m = name.match(EXT_RE)
  return m ? m[1].toLowerCase() : null
}

/**
 * Remove quality tags inside brackets/parens and any trailing dots/spaces/dashes.
 */
function stripQualityTags(str) {
  return str
    .replace(BRACKET_QUALITY_RE, '')
    .replace(/[\s.\-_]+$/, '')
    .trim()
}

/**
 * Clean up a raw title string: replace dots/underscores used as separators,
 * collapse multiple spaces, trim.
 */
function cleanTitle(raw) {
  return raw
    .replace(/[._]+/g, ' ')  // dots/underscores → spaces
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a folder name.
 *
 * Returns: { title, year, isGrouped }
 *   isGrouped — true when the folder contains multiple films (no year, bare title)
 *
 * Examples:
 *   "The Dark Knight (2008)"  → { title: "The Dark Knight", year: 2008, isGrouped: false }
 *   "The Hunger Games"        → { title: "The Hunger Games", year: null,  isGrouped: true }
 */
export function parseFolder(folderName) {
  let name = folderName.trim()

  // Strip quality tags that might appear in folder names
  name = stripQualityTags(name)

  const yearMatch = name.match(YEAR_PAREN_RE)
  const year = yearMatch ? parseInt(yearMatch[1], 10) : null

  // Remove the year from the title string
  let titleRaw = year ? name.replace(YEAR_PAREN_RE, '') : name
  titleRaw = cleanTitle(titleRaw)

  return {
    title: titleRaw,
    year,
    isGrouped: year === null,
  }
}

/**
 * Parse a media filename (video or audio).
 *
 * Returns one of two shapes depending on whether it's an episode:
 *
 * Movie / track:
 *   { type: 'movie'|'audio', title, year, quality, extension }
 *
 * Series episode:
 *   { type: 'episode', title, season, episode, episodeEnd, quality, extension }
 *   episodeEnd is set for multi-episode files (e.g. S01E01E02), otherwise null.
 */
export function parseFilename(filename) {
  const ext = getExtension(filename)
  const isVideo = ext && VIDEO_EXTENSIONS.has(ext)
  const isAudio = ext && AUDIO_EXTENSIONS.has(ext)

  let name = stripExtension(filename).trim()

  // ── Episode detection (must run before year detection) ──────────────────────
  const episodeMatch = name.match(EPISODE_RE)
  if (episodeMatch) {
    const season = parseInt(episodeMatch[1], 10)
    const episode = parseInt(episodeMatch[2], 10)
    const episodeEnd = episodeMatch[3] ? parseInt(episodeMatch[3], 10) : null

    // Everything after the SxxExx token is the episode title
    const afterToken = name.slice(name.search(EPISODE_RE) + episodeMatch[0].length)
    let episodeTitle = afterToken
      .replace(/^[\s\-–—.]+/, '')   // strip leading separator
      .trim()

    episodeTitle = stripQualityTags(episodeTitle)
    episodeTitle = cleanTitle(episodeTitle)

    // Quality: look in the full name for a bracketed quality tag
    const quality = extractQuality(name)

    return {
      type: 'episode',
      title: episodeTitle || null,
      season,
      episode,
      episodeEnd,
      quality,
      extension: ext,
    }
  }

  // ── Movie / audio file ───────────────────────────────────────────────────────

  // Extract quality before stripping, so we capture it from brackets
  const quality = extractQuality(name)

  // Strip quality tags
  name = stripQualityTags(name)

  // Try year in parens first, then a looser bare year
  let year = null
  let yearMatch = name.match(YEAR_PAREN_RE)
  if (yearMatch) {
    year = parseInt(yearMatch[1], 10)
    name = name.replace(YEAR_PAREN_RE, '')
  } else {
    yearMatch = name.match(YEAR_LOOSE_RE)
    if (yearMatch) {
      year = parseInt(yearMatch[1], 10)
      // Only strip the bare year if it's surrounded by non-word chars (don't mangle titles)
      name = name.replace(new RegExp(`\\b${year}\\b`), '')
    }
  }

  const title = cleanTitle(name)

  return {
    type: isAudio ? 'audio' : 'movie',
    title,
    year,
    quality,
    extension: ext,
  }
}

/**
 * Parse a subtitle filename.
 * Returns: { language, extension }
 *
 * Examples:
 *   "The Dark Knight.en.srt"  → { language: "en", extension: "srt" }
 *   "subtitle.srt"            → { language: null,  extension: "srt" }
 */
export function parseSubtitle(filename) {
  const ext = getExtension(filename)
  // Language code is the segment before the extension if it's 2-3 alpha chars
  const langMatch = filename.match(/\.([a-z]{2,3})\.[a-z]{2,4}$/i)
  return {
    language: langMatch ? langMatch[1].toLowerCase() : null,
    extension: ext,
  }
}

/**
 * Returns true if the filename is a video file.
 */
export function isVideoFile(filename) {
  const ext = getExtension(filename)
  return ext !== null && VIDEO_EXTENSIONS.has(ext)
}

/**
 * Returns true if the filename is an audio file.
 */
export function isAudioFile(filename) {
  const ext = getExtension(filename)
  return ext !== null && AUDIO_EXTENSIONS.has(ext)
}

/**
 * Returns true if the filename is a subtitle file.
 */
export function isSubtitleFile(filename) {
  const ext = getExtension(filename)
  return ext !== null && SUBTITLE_EXTENSIONS.has(ext)
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Extract the first bracketed quality tag from a raw name string.
 * Returns e.g. "1080p", "4K", or null.
 */
function extractQuality(name) {
  // Reset regex state (global flag retains lastIndex)
  BRACKET_QUALITY_RE.lastIndex = 0
  const m = BRACKET_QUALITY_RE.exec(name)
  BRACKET_QUALITY_RE.lastIndex = 0
  return m ? m[1].toLowerCase() : null
}
