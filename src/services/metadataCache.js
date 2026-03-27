/**
 * metadataCache.js
 *
 * localStorage-backed cache for TMDB metadata.
 * Metadata is stored indefinitely — it's fetched once and kept forever,
 * since movie/show details don't change meaningfully.
 *
 * Key format:  "tooty:meta:<type>:<id>"
 *   type — "movie" | "tv" | "search"
 *   id   — TMDB ID (number) or a search key string
 *
 * Also stores playback progress separately:
 * Key format:  "tooty:progress:<mediaId>"
 */

const NS = 'tooty'

// ─── Metadata ─────────────────────────────────────────────────────────────────

/**
 * Retrieve cached TMDB metadata for a given type + id.
 * Returns the parsed object or null if not found.
 */
export function getCachedMetadata(type, id) {
  try {
    const raw = localStorage.getItem(metaKey(type, id))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Store TMDB metadata in the cache.
 * @param {string} type  — 'movie' | 'tv'
 * @param {number|string} id
 * @param {object} data  — raw TMDB response object
 */
export function setCachedMetadata(type, id, data) {
  try {
    localStorage.setItem(metaKey(type, id), JSON.stringify(data))
  } catch (e) {
    // localStorage quota exceeded — prune oldest entries and retry once
    pruneMetadata()
    try {
      localStorage.setItem(metaKey(type, id), JSON.stringify(data))
    } catch {
      // If still failing, skip silently — app degrades gracefully without cache
    }
  }
}

/**
 * Returns true if metadata is already cached for this type + id.
 */
export function hasMetadata(type, id) {
  return localStorage.getItem(metaKey(type, id)) !== null
}

/**
 * Remove all cached metadata entries (does not touch progress data).
 */
export function clearMetadataCache() {
  const keysToRemove = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (key.startsWith(`${NS}:meta:`) || key.startsWith(`${NS}:lookup:`))) {
      keysToRemove.push(key)
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k))
}

/**
 * Retrieve a cached lookup result for a title/year query.
 * Returns the parsed object or null if not found.
 */
export function getCachedLookup(type, key) {
  try {
    const raw = localStorage.getItem(lookupKey(type, key))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Store a lookup result for a title/year query.
 * The value can represent either a hit or a miss.
 */
export function setCachedLookup(type, key, data) {
  try {
    localStorage.setItem(lookupKey(type, key), JSON.stringify(data))
  } catch {
    // Fail silently; lookup caching is an optimisation.
  }
}

// ─── Playback progress ────────────────────────────────────────────────────────

/**
 * Save playback position for a media item.
 * @param {string} mediaId   — unique ID for the media file (e.g. file path hash)
 * @param {number} position  — position in seconds
 * @param {number} duration  — total duration in seconds
 */
export function saveProgress(mediaId, position, duration) {
  try {
    const data = { position, duration, updatedAt: Date.now() }
    localStorage.setItem(progressKey(mediaId), JSON.stringify(data))
  } catch {
    // Fail silently — progress loss is acceptable
  }
}

/**
 * Retrieve saved playback progress.
 * Returns { position, duration, updatedAt } or null.
 */
export function getProgress(mediaId) {
  try {
    const raw = localStorage.getItem(progressKey(mediaId))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Remove progress for a media item (e.g. user marks as watched).
 */
export function clearProgress(mediaId) {
  localStorage.removeItem(progressKey(mediaId))
}

/**
 * Get all saved progress entries, sorted by most recently updated.
 * Returns an array of { mediaId, position, duration, updatedAt }.
 */
export function getAllProgress() {
  const prefix = `${NS}:progress:`
  const results = []

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key || !key.startsWith(prefix)) continue
    try {
      const data = JSON.parse(localStorage.getItem(key))
      results.push({ mediaId: key.slice(prefix.length), ...data })
    } catch {
      // Skip malformed entries
    }
  }

  return results.sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Remove all progress data.
 */
export function clearAllProgress() {
  const keysToRemove = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(`${NS}:progress:`)) keysToRemove.push(key)
  }
  keysToRemove.forEach(k => localStorage.removeItem(k))
}

// ─── Internals ────────────────────────────────────────────────────────────────

function metaKey(type, id) {
  return `${NS}:meta:${type}:${id}`
}

function lookupKey(type, key) {
  return `${NS}:lookup:${type}:${key}`
}

function progressKey(mediaId) {
  return `${NS}:progress:${mediaId}`
}

/**
 * Remove the oldest half of metadata entries when storage is full.
 * We can't sort by write time directly, so we remove entries by index.
 */
function pruneMetadata() {
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(`${NS}:meta:`)) keys.push(key)
  }
  // Remove the first half (arbitrary, but avoids unbounded growth)
  keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k))
}
