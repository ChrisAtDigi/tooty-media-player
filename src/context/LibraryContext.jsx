/**
 * LibraryContext.jsx
 *
 * Provides the scanned media library to all screens.
 *
 * On mount:
 *   1. Detect connected devices
 *   2. Scan filesystem or load from localStorage cache
 *   3. Background TMDB enrichment — adds posterPath, backdropPath, overview, rating to each item
 *   4. Re-save enriched library back to localStorage cache
 */

import React, {
  createContext, useContext, useEffect, useState, useCallback, useMemo, useRef,
} from 'react'
import {
  detectDevices, needsScan, saveDeviceLibrary, loadDeviceLibrary,
} from '../services/deviceDetector.js'
import { scanStorage } from '../services/scanner.js'
import { resolveMovie, resolveTv } from '../services/tmdb.js'

const LibraryContext = createContext(null)

const EMPTY_LIBRARY = { movies: [], series: [], audiobooks: [], music: [], scannedAt: null }

export function LibraryProvider({ children }) {
  const [library,   setLibrary]   = useState(EMPTY_LIBRARY)
  const [device,    setDevice]    = useState(null)
  const [loading,   setLoading]   = useState(true)
  const [enriching, setEnriching] = useState(false)

  // Mutable ref so enrichLibrary can re-save without a stale device closure
  const deviceRef = useRef(null)

  const loadLibrary = useCallback(async (forceRescan = false) => {
    setLoading(true)
    try {
      const devices = await detectDevices()
      const primary = devices[0] ?? null
      setDevice(primary)
      deviceRef.current = primary

      if (!primary) {
        setLoading(false)
        return
      }

      let lib
      if (needsScan(primary.key, forceRescan)) {
        lib = await scanStorage(primary.rootPath)
        saveDeviceLibrary(primary.key, primary.label, primary.rootPath, lib)
      } else {
        const cached = loadDeviceLibrary(primary.key)
        lib = cached?.library ?? { ...EMPTY_LIBRARY, scannedAt: Date.now() }
      }

      setLibrary(lib)
      setLoading(false)

      // Kick off TMDB enrichment without blocking the UI
      enrichLibrary(lib)
    } catch (err) {
      console.error('[Tooty] Library load error:', err)
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function enrichLibrary(lib) {
    setEnriching(true)
    let changed = false

    for (const movie of lib.movies) {
      if (movie.tmdbId) continue
      try {
        const data = await resolveMovie(movie.title, movie.year)
        if (data) {
          movie.tmdbId       = data.id
          movie.posterPath   = data.poster_path
          movie.backdropPath = data.backdrop_path
          movie.overview     = data.overview
          movie.rating       = data.vote_average
          changed = true
        }
      } catch { /* keep going */ }
    }

    for (const show of lib.series) {
      if (show.tmdbId) continue
      try {
        const data = await resolveTv(show.title, show.year)
        if (data) {
          show.tmdbId       = data.id
          show.posterPath   = data.poster_path
          show.backdropPath = data.backdrop_path
          show.overview     = data.overview
          show.rating       = data.vote_average
          changed = true
        }
      } catch { /* keep going */ }
    }

    if (changed) {
      const dev = deviceRef.current
      if (dev) saveDeviceLibrary(dev.key, dev.label, dev.rootPath, lib)
      setLibrary({ ...lib })
    }

    setEnriching(false)
  }

  useEffect(() => { loadLibrary() }, [loadLibrary])

  // Build a lookup map for all items (including individual episodes)
  const itemById = useMemo(() => {
    const map = new Map()
    for (const item of library.movies)     map.set(item.id, { ...item, type: 'movie' })
    for (const item of library.series)     map.set(item.id, { ...item, type: 'tv' })
    for (const item of library.audiobooks) map.set(item.id, { ...item, type: 'audiobook' })
    for (const item of library.music)      map.set(item.id, { ...item, type: 'music' })
    // Index episodes so PlayerScreen can resolve them by id
    for (const show of library.series) {
      for (const season of (show.seasons ?? [])) {
        for (const ep of (season.episodes ?? [])) {
          map.set(ep.id, {
            ...ep,
            type: 'episode',
            showId:      show.id,
            showTitle:   show.title,
            showTmdbId:  show.tmdbId,
          })
        }
      }
    }
    return map
  }, [library])

  const rescan = useCallback(() => loadLibrary(true), [loadLibrary])

  return (
    <LibraryContext.Provider value={{ library, itemById, device, loading, enriching, rescan }}>
      {children}
    </LibraryContext.Provider>
  )
}

export function useLibrary() {
  const ctx = useContext(LibraryContext)
  if (!ctx) throw new Error('useLibrary must be used within a LibraryProvider')
  return ctx
}
