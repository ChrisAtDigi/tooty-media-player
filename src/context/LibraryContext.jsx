import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  detectDevices,
  invalidateDevice,
  loadDeviceLibrary,
  needsScan,
  saveDeviceLibrary,
} from '../services/deviceDetector.js'
import { scanStorage } from '../services/scanner.js'
import {
  buildLookupKey,
  fetchMovieDetails,
  fetchTvDetails,
  resolveMovie,
  resolveTv,
} from '../services/tmdb.js'
import { getCachedLookup } from '../services/metadataCache.js'

const LibraryContext = createContext(null)

const EMPTY_LIBRARY = {
  movies: [],
  series: [],
  audiobooks: [],
  music: [],
  scannedAt: null,
}

export function LibraryProvider({ children }) {
  const [library, setLibrary] = useState(EMPTY_LIBRARY)
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [detectingDevices, setDetectingDevices] = useState(true)
  const [enriching, setEnriching] = useState(false)
  const loadIdRef = useRef(0)

  const refreshDevices = useCallback(async ({ forceRescan = false } = {}) => {
    const loadId = ++loadIdRef.current
    setLoading(true)
    setDetectingDevices(true)

    try {
      const detectedDevices = await detectDevices()
      if (loadId !== loadIdRef.current) return

      setDevices(detectedDevices)
      setDetectingDevices(false)

      if (detectedDevices.length === 0) {
        setLibrary({ ...EMPTY_LIBRARY, scannedAt: Date.now() })
        setEnriching(false)
        setLoading(false)
        return
      }

      const deviceRecords = []
      for (const device of detectedDevices) {
        if (loadId !== loadIdRef.current) return
        const record = await loadOrScanDevice(device, forceRescan)
        deviceRecords.push(record)
      }

      if (loadId !== loadIdRef.current) return

      const merged = mergeDeviceLibraries(deviceRecords)
      setLibrary(merged)
      setLoading(false)

      void enrichLibrary({
        isStale: () => loadId !== loadIdRef.current,
        deviceRecords,
        mergedLibrary: merged,
        setLibrary,
        setEnriching,
      })
    } catch (error) {
      console.warn('[LibraryContext] Failed to load devices:', error)
      if (loadId !== loadIdRef.current) return
      setDevices([])
      setLibrary({ ...EMPTY_LIBRARY, scannedAt: Date.now() })
      setEnriching(false)
      setLoading(false)
      setDetectingDevices(false)
    }
  }, [])

  const rescan = useCallback(async () => {
    const knownDevices = await detectDevices()
    knownDevices.forEach(device => invalidateDevice(device.key))
    await refreshDevices({ forceRescan: true })
  }, [refreshDevices])

  useEffect(() => {
    void refreshDevices()
  }, [refreshDevices])

  const itemById = useMemo(() => buildItemMap(library), [library])
  const genreCollections = useMemo(() => buildGenreCollections(library), [library])

  const value = useMemo(() => ({
    library,
    itemById,
    genreCollections,
    devices,
    device: devices.length === 1 ? devices[0] : null,
    loading,
    detectingDevices,
    enriching,
    refreshDevices,
    rescan,
  }), [
    library,
    itemById,
    genreCollections,
    devices,
    loading,
    detectingDevices,
    enriching,
    refreshDevices,
    rescan,
  ])

  return (
    <LibraryContext.Provider value={value}>
      {children}
    </LibraryContext.Provider>
  )
}

export function useLibrary() {
  const value = useContext(LibraryContext)
  if (!value) throw new Error('useLibrary must be used within a LibraryProvider')
  return value
}

async function loadOrScanDevice(device, forceRescan) {
  if (!needsScan(device.key, forceRescan)) {
    const cached = loadDeviceLibrary(device.key)
    if (cached?.library) return cached
  }

  const scannedLibrary = await scanStorage(device.rootPath)
  saveDeviceLibrary(device.key, device.label, device.rootPath, scannedLibrary)
  return {
    key: device.key,
    label: device.label,
    rootPath: device.rootPath,
    library: scannedLibrary,
    scannedAt: Date.now(),
  }
}

function mergeDeviceLibraries(deviceRecords) {
  const merged = {
    movies: [],
    series: [],
    audiobooks: [],
    music: [],
    scannedAt: null,
  }

  const seen = {
    movies: new Set(),
    series: new Set(),
    audiobooks: new Set(),
    music: new Set(),
  }

  for (const record of deviceRecords) {
    const sourceKey = record?.key ?? 'unknown-device'
    const sourceLibrary = record?.library ?? EMPTY_LIBRARY

    merged.scannedAt = Math.max(
      merged.scannedAt ?? 0,
      sourceLibrary.scannedAt ?? record?.scannedAt ?? 0
    )

    pushUniqueItems(merged.movies, seen.movies, sourceLibrary.movies, 'movies', sourceKey)
    pushUniqueItems(merged.series, seen.series, sourceLibrary.series, 'series', sourceKey)
    pushUniqueItems(merged.audiobooks, seen.audiobooks, sourceLibrary.audiobooks, 'audiobooks', sourceKey)
    pushUniqueItems(merged.music, seen.music, sourceLibrary.music, 'music', sourceKey)
  }

  merged.scannedAt = merged.scannedAt || Date.now()
  merged.movies.sort(sortByTitle)
  merged.series.sort(sortByTitle)
  merged.audiobooks.sort(sortByTitle)
  merged.music.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))

  return merged
}

function pushUniqueItems(target, seen, items = [], category, sourceDeviceKey) {
  for (const item of items) {
    const signature = buildItemSignature(item, category)
    if (seen.has(signature)) continue
    seen.add(signature)
    target.push(normalizeItem(item, category, sourceDeviceKey))
  }
}

function normalizeItem(item, category, sourceDeviceKey) {
  if (category === 'movies') {
    return { ...item, type: 'movie', sourceDeviceKey }
  }
  if (category === 'series') {
    return {
      ...item,
      type: 'tv',
      sourceDeviceKey,
      seasons: (item.seasons ?? []).map(season => ({
        ...season,
        episodes: (season.episodes ?? []).map(episode => ({
          ...episode,
          type: 'episode',
          parentId: item.id,
          sourceDeviceKey,
        })),
      })),
    }
  }
  if (category === 'audiobooks') {
    return {
      ...item,
      type: 'audiobook',
      sourceDeviceKey,
      chapters: (item.chapters ?? []).map(chapter => ({
        ...chapter,
        type: 'chapter',
        parentId: item.id,
        sourceDeviceKey,
      })),
    }
  }
  return { ...item, type: 'music', sourceDeviceKey }
}

function buildItemSignature(item, category) {
  const basis =
    item.filePath ??
    item.folderPath ??
    item.path ??
    `${item.title ?? item.name ?? 'untitled'}::${item.year ?? ''}`

  return `${category}:${normalizePathKey(basis)}`
}

function normalizePathKey(path) {
  return String(path)
    .replace(/^removable\d+:\/\//i, '')
    .replace(/^[a-z]:[\\/]/i, '')
    .replace(/\\/g, '/')
    .toLowerCase()
}

function sortByTitle(a, b) {
  return (a.title ?? '').localeCompare(b.title ?? '')
}

function buildItemMap(library) {
  const map = new Map()

  for (const movie of library.movies) map.set(movie.id, movie)

  for (const show of library.series) {
    map.set(show.id, show)
    for (const season of show.seasons ?? []) {
      for (const episode of season.episodes ?? []) {
        map.set(episode.id, show)
      }
    }
  }

  for (const book of library.audiobooks) {
    map.set(book.id, book)
    for (const chapter of book.chapters ?? []) {
      map.set(chapter.id, book)
    }
  }

  for (const artist of library.music) {
    map.set(artist.id, artist)
    for (const album of artist.albums ?? []) {
      map.set(album.id, artist)
      for (const track of album.tracks ?? []) {
        map.set(track.id, artist)
      }
    }
  }

  return map
}

function buildGenreCollections(library) {
  const byGenre = new Map()
  const sourceItems = [...library.movies, ...library.series]

  for (const item of sourceItems) {
    for (const genre of item.genres ?? []) {
      if (!byGenre.has(genre)) byGenre.set(genre, [])
      byGenre.get(genre).push(item)
    }
  }

  return [...byGenre.entries()]
    .map(([name, items]) => ({
      name,
      items: items.sort((a, b) => (b.year ?? 0) - (a.year ?? 0)),
    }))
    .sort((a, b) => b.items.length - a.items.length || a.name.localeCompare(b.name))
}

async function enrichLibrary({ isStale, deviceRecords, mergedLibrary, setLibrary, setEnriching }) {
  if (!hasEnrichableContent(mergedLibrary)) {
    setEnriching(false)
    return
  }

  setEnriching(true)
  const currentRecords = cloneDeviceRecords(deviceRecords)
  const enrichedLibrary = {
    ...mergedLibrary,
    movies: [...mergedLibrary.movies],
    series: [...mergedLibrary.series],
    audiobooks: [...mergedLibrary.audiobooks],
    music: [...mergedLibrary.music],
  }

  let changed = false

  for (let i = 0; i < enrichedLibrary.movies.length; i++) {
    if (isStale()) return
    const movie = enrichedLibrary.movies[i]
    if (isMetadataComplete(movie)) continue
    const enriched = await enrichMovie(movie)
    if (!enriched) continue
    enrichedLibrary.movies[i] = enriched
    patchDeviceRecord(currentRecords, movie.sourceDeviceKey, 'movies', enriched)
    changed = true
    await sleep(150)
  }

  for (let i = 0; i < enrichedLibrary.series.length; i++) {
    if (isStale()) return
    const show = enrichedLibrary.series[i]
    if (isMetadataComplete(show)) continue
    const enriched = await enrichSeries(show)
    if (!enriched) continue
    enrichedLibrary.series[i] = enriched
    patchDeviceRecord(currentRecords, show.sourceDeviceKey, 'series', enriched)
    changed = true
    await sleep(150)
  }

  if (isStale()) return

  if (changed) {
    for (const record of currentRecords) {
      saveDeviceLibrary(record.key, record.label, record.rootPath, record.library)
    }
    setLibrary(enrichedLibrary)
  }

  setEnriching(false)
}

function hasEnrichableContent(library) {
  return library.movies.length > 0 || library.series.length > 0
}

function isMetadataComplete(item) {
  return Boolean(
    item.tmdbId &&
    Array.isArray(item.genres) &&
    item.genres.length > 0 &&
    (item.posterPath || item.backdropPath || item.overview || item.rating)
  )
}

async function enrichMovie(movie) {
  const lookupKey = buildLookupKey(movie.title, movie.year)
  const cachedMiss = getCachedLookup('movie-search', lookupKey)
  if (!movie.tmdbId && cachedMiss?.status === 'miss') return null

  const details = movie.tmdbId
    ? await fetchMovieDetails(movie.tmdbId)
    : await resolveMovie(movie.title, movie.year)

  if (!details) return null
  return applyTmdbDetails(movie, details, 'movie')
}

async function enrichSeries(show) {
  const lookupKey = buildLookupKey(show.title, show.year)
  const cachedMiss = getCachedLookup('tv-search', lookupKey)
  if (!show.tmdbId && cachedMiss?.status === 'miss') return null

  const details = show.tmdbId
    ? await fetchTvDetails(show.tmdbId)
    : await resolveTv(show.title, show.year)

  if (!details) return null
  return applyTmdbDetails(show, details, 'tv')
}

function applyTmdbDetails(item, details, type) {
  return {
    ...item,
    type,
    tmdbId: details.id,
    posterPath: details.poster_path ?? item.posterPath ?? null,
    backdropPath: details.backdrop_path ?? item.backdropPath ?? null,
    overview: details.overview ?? item.overview ?? '',
    rating: details.vote_average ?? item.rating ?? null,
    genres: (details.genres ?? []).map(genre => genre.name),
  }
}

function cloneDeviceRecords(deviceRecords) {
  return deviceRecords.map(record => ({
    ...record,
    library: {
      ...record.library,
      movies: [...(record.library?.movies ?? [])],
      series: [...(record.library?.series ?? [])],
      audiobooks: [...(record.library?.audiobooks ?? [])],
      music: [...(record.library?.music ?? [])],
    },
  }))
}

function patchDeviceRecord(deviceRecords, deviceKey, category, item) {
  const record = deviceRecords.find(entry => entry.key === deviceKey)
  if (!record) return
  const list = record.library?.[category]
  if (!Array.isArray(list)) return
  const index = list.findIndex(entry => entry.id === item.id)
  if (index === -1) return
  list[index] = stripRuntimeFields(item)
}

function stripRuntimeFields(item) {
  const { sourceDeviceKey, type, ...rest } = item
  return rest
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
