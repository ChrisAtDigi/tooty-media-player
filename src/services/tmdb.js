/**
 * tmdb.js
 *
 * TMDB API client.
 * Fetches metadata for movies and TV shows, backed by metadataCache.
 *
 * TMDB credentials are stored in localStorage under "tooty:config:tmdbKey".
 * This value may be either:
 *   - a TMDB v3 API key
 *   - a TMDB v4 read access token
 *
 * All fetch functions return null on failure — callers degrade gracefully.
 */

import {
  getCachedMetadata,
  setCachedMetadata,
  getCachedLookup,
  setCachedLookup,
} from './metadataCache.js'

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

// Env vars take priority (baked in at build time), then localStorage override.
export function getTmdbCredential() {
  return (
    import.meta.env.VITE_TMDB_API_KEY ||
    import.meta.env.VITE_TMDB_READ_ACCESS_TOKEN ||
    localStorage.getItem('tooty:config:tmdbKey') ||
    null
  )
}

export function getTmdbApiKey() {
  return getTmdbCredential()
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

function getAuthConfig() {
  const credential = getTmdbCredential()
  if (!credential) return null

  if (credential.includes('.') || credential.startsWith('eyJ')) {
    return {
      kind: 'bearer',
      headers: {
        Authorization: `Bearer ${credential}`,
        'Content-Type': 'application/json',
      },
    }
  }

  return {
    kind: 'apiKey',
    apiKey: credential,
    headers: {},
  }
}

function withAuthParams(params, auth) {
  if (auth?.kind === 'apiKey') params.set('api_key', auth.apiKey)
  return params
}

async function tmdbFetch(path, params = new URLSearchParams()) {
  const auth = getAuthConfig()
  if (!auth) return null

  const finalParams = withAuthParams(params, auth)

  try {
    const res = await fetch(`${BASE_URL}${path}?${finalParams}`, {
      headers: auth.headers,
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Search TMDB for a movie by title (and optional year).
 * Returns the best-match result object or null.
 * Results are NOT cached — only the final enriched fetch is cached.
 */
export async function searchMovie(title, year = null) {
  if (!getTmdbCredential()) return null

  const cacheKey = buildLookupKey(title, year)
  const cached = getCachedLookup('movie-search', cacheKey)
  if (cached) {
    return cached.status === 'miss' ? null : cached.result
  }

  const params = new URLSearchParams({
    query: title,
    include_adult: 'false',
    language: 'en-US',
    page: '1',
  })
  if (year) params.set('year', String(year))

  const data = await tmdbFetch('/search/movie', params)
  if (!data) return null

  const result = pickBestResult(data.results, title, year)
  setCachedLookup(
    'movie-search',
    cacheKey,
    result
      ? { status: 'hit', result }
      : { status: 'miss' }
  )
  return result
}

/**
 * Search TMDB for a TV show by title (and optional year).
 * Returns the best-match result object or null.
 */
export async function searchTv(title, year = null) {
  if (!getTmdbCredential()) return null

  const cacheKey = buildLookupKey(title, year)
  const cached = getCachedLookup('tv-search', cacheKey)
  if (cached) {
    return cached.status === 'miss' ? null : cached.result
  }

  const params = new URLSearchParams({
    query: title,
    include_adult: 'false',
    language: 'en-US',
    page: '1',
  })
  if (year) params.set('first_air_date_year', String(year))

  const data = await tmdbFetch('/search/tv', params)
  if (!data) return null

  const result = pickBestResult(data.results, title, year)
  setCachedLookup(
    'tv-search',
    cacheKey,
    result
      ? { status: 'hit', result }
      : { status: 'miss' }
  )
  return result
}

// ─── Detail fetches ───────────────────────────────────────────────────────────

/**
 * Fetch full movie details from TMDB (with credits appended).
 * Returns cached data if available, otherwise fetches and caches.
 */
export async function fetchMovieDetails(tmdbId) {
  const cached = getCachedMetadata('movie', tmdbId)
  if (cached) return cached

  const params = new URLSearchParams({
    language: 'en-US',
    append_to_response: 'credits',
  })

  const data = await tmdbFetch(`/movie/${tmdbId}`, params)
  if (!data) return null
  setCachedMetadata('movie', tmdbId, data)
  return data
}

/**
 * Fetch full TV show details from TMDB (with credits appended).
 * Returns cached data if available, otherwise fetches and caches.
 */
export async function fetchTvDetails(tmdbId) {
  const cached = getCachedMetadata('tv', tmdbId)
  if (cached) return cached

  const params = new URLSearchParams({
    language: 'en-US',
    append_to_response: 'credits',
  })

  const data = await tmdbFetch(`/tv/${tmdbId}`, params)
  if (!data) return null
  setCachedMetadata('tv', tmdbId, data)
  return data
}

/**
 * Fetch a single TV season payload, including canonical episode titles.
 * Results are cached per show/season combination.
 */
export async function fetchTvSeasonDetails(tmdbId, seasonNumber) {
  const seasonKey = `${tmdbId}:${seasonNumber}`
  const cached = getCachedMetadata('tv-season', seasonKey)
  if (cached) return cached

  const params = new URLSearchParams({
    language: 'en-US',
  })

  const data = await tmdbFetch(`/tv/${tmdbId}/season/${seasonNumber}`, params)
  if (!data) return null
  setCachedMetadata('tv-season', seasonKey, data)
  return data
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

export function buildLookupKey(title, year) {
  const cleanedTitle = title?.trim().toLowerCase() ?? ''
  return `${cleanedTitle}::${year ?? ''}`
}
