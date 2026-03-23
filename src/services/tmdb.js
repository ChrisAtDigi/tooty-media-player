/**
 * tmdb.js
 *
 * TMDB API client.
 * Fetches metadata for movies and TV shows, backed by metadataCache.
 *
 * API key is stored in localStorage under "tooty:config:tmdbKey".
 * The user enters it once in the Settings screen.
 *
 * All fetch functions return null on failure — callers degrade gracefully.
 */

import { getCachedMetadata, setCachedMetadata, hasMetadata } from './metadataCache.js'

const BASE_URL = 'https://api.themoviedb.org/3'
const IMAGE_BASE = 'https://image.tmdb.org/t/p'

// Poster sizes available from TMDB
export const POSTER_SIZES = {
  small:  `${IMAGE_BASE}/w185`,
  medium: `${IMAGE_BASE}/w342`,
  large:  `${IMAGE_BASE}/w500`,
  xl:     `${IMAGE_BASE}/w780`,
  full:   `${IMAGE_BASE}/original`,
}

// Backdrop sizes
export const BACKDROP_SIZES = {
  small:  `${IMAGE_BASE}/w300`,
  medium: `${IMAGE_BASE}/w780`,
  large:  `${IMAGE_BASE}/w1280`,
  full:   `${IMAGE_BASE}/original`,
}

// ─── Config ───────────────────────────────────────────────────────────────────

export function getTmdbApiKey() {
  return localStorage.getItem('tooty:config:tmdbKey') || null
}

export function setTmdbApiKey(key) {
  localStorage.setItem('tooty:config:tmdbKey', key.trim())
}

// ─── URL helpers ──────────────────────────────────────────────────────────────

export function posterUrl(path, size = 'large') {
  if (!path) return null
  return `${POSTER_SIZES[size]}${path}`
}

export function backdropUrl(path, size = 'large') {
  if (!path) return null
  return `${BACKDROP_SIZES[size]}${path}`
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Search TMDB for a movie by title (and optional year).
 * Returns the best-match result object or null.
 * Results are NOT cached — only the final enriched fetch is cached.
 */
export async function searchMovie(title, year = null) {
  const apiKey = getTmdbApiKey()
  if (!apiKey) return null

  const params = new URLSearchParams({
    api_key: apiKey,
    query: title,
    include_adult: 'false',
    language: 'en-US',
    page: '1',
  })
  if (year) params.set('year', String(year))

  try {
    const res = await fetch(`${BASE_URL}/search/movie?${params}`)
    if (!res.ok) return null
    const data = await res.json()
    return pickBestResult(data.results, title, year)
  } catch {
    return null
  }
}

/**
 * Search TMDB for a TV show by title (and optional year).
 * Returns the best-match result object or null.
 */
export async function searchTv(title, year = null) {
  const apiKey = getTmdbApiKey()
  if (!apiKey) return null

  const params = new URLSearchParams({
    api_key: apiKey,
    query: title,
    include_adult: 'false',
    language: 'en-US',
    page: '1',
  })
  if (year) params.set('first_air_date_year', String(year))

  try {
    const res = await fetch(`${BASE_URL}/search/tv?${params}`)
    if (!res.ok) return null
    const data = await res.json()
    return pickBestResult(data.results, title, year)
  } catch {
    return null
  }
}

// ─── Detail fetches ───────────────────────────────────────────────────────────

/**
 * Fetch full movie details from TMDB (with credits appended).
 * Returns cached data if available, otherwise fetches and caches.
 */
export async function fetchMovieDetails(tmdbId) {
  const cached = getCachedMetadata('movie', tmdbId)
  if (cached) return cached

  const apiKey = getTmdbApiKey()
  if (!apiKey) return null

  const params = new URLSearchParams({
    api_key: apiKey,
    language: 'en-US',
    append_to_response: 'credits',
  })

  try {
    const res = await fetch(`${BASE_URL}/movie/${tmdbId}?${params}`)
    if (!res.ok) return null
    const data = await res.json()
    setCachedMetadata('movie', tmdbId, data)
    return data
  } catch {
    return null
  }
}

/**
 * Fetch full TV show details from TMDB (with credits appended).
 * Returns cached data if available, otherwise fetches and caches.
 */
export async function fetchTvDetails(tmdbId) {
  const cached = getCachedMetadata('tv', tmdbId)
  if (cached) return cached

  const apiKey = getTmdbApiKey()
  if (!apiKey) return null

  const params = new URLSearchParams({
    api_key: apiKey,
    language: 'en-US',
    append_to_response: 'credits',
  })

  try {
    const res = await fetch(`${BASE_URL}/tv/${tmdbId}?${params}`)
    if (!res.ok) return null
    const data = await res.json()
    setCachedMetadata('tv', tmdbId, data)
    return data
  } catch {
    return null
  }
}

/**
 * Convenience: search for a movie and immediately fetch its full details.
 * Skips the detail fetch if the search result is already cached by TMDB ID.
 */
export async function resolveMovie(title, year = null) {
  const searchResult = await searchMovie(title, year)
  if (!searchResult) return null
  return fetchMovieDetails(searchResult.id)
}

/**
 * Convenience: search for a TV show and immediately fetch its full details.
 */
export async function resolveTv(title, year = null) {
  const searchResult = await searchTv(title, year)
  if (!searchResult) return null
  return fetchTvDetails(searchResult.id)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Pick the best result from a TMDB search result array.
 * Prefers exact title match. Falls back to first result.
 */
function pickBestResult(results, title, year) {
  if (!results || results.length === 0) return null

  const normalise = str => str?.toLowerCase().trim() ?? ''
  const queryTitle = normalise(title)

  // Try exact title match first
  const titleField = results[0].title !== undefined ? 'title' : 'name'
  const exact = results.find(r => normalise(r[titleField]) === queryTitle)
  if (exact) return exact

  // If year provided, try matching on year too
  if (year) {
    const yearStr = String(year)
    const withYear = results.find(r => {
      const releaseDate = r.release_date || r.first_air_date || ''
      return releaseDate.startsWith(yearStr) && normalise(r[titleField]).includes(queryTitle)
    })
    if (withYear) return withYear
  }

  // Default to first (highest popularity) result
  return results[0]
}
