import React, { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FocusRing from '../components/FocusRing.jsx'
import useNavigation from '../hooks/useNavigation.js'
import { useLibrary } from '../context/LibraryContext.jsx'
import { getTmdbApiKey, resolveMovie, resolveTv, setTmdbApiKey } from '../services/tmdb.js'
import { clearMetadataCache, clearAllProgress } from '../services/metadataCache.js'
import { listDirectory } from '../services/scanner.js'

function Section({ title, children }) {
  return (
    <div>
      <p className="text-xs text-text-muted uppercase tracking-widest mb-4">{title}</p>
      <div className="divide-y divide-white/10 border-t border-b border-white/10">
        {children}
      </div>
    </div>
  )
}

function SettingRow({ label, description, children }) {
  return (
    <div className="flex items-center justify-between py-5 gap-8">
      <div className="min-w-0">
        <p className="text-base text-text-primary">{label}</p>
        {description && <p className="text-xs text-text-muted mt-1">{description}</p>}
      </div>
      <div className="flex-none">{children}</div>
    </div>
  )
}

export default function SettingsScreen() {
  const navigate = useNavigate()
  const { library, devices, enriching, refreshDevices, rescan } = useLibrary()

  const [apiKey, setApiKey] = useState(getTmdbApiKey() ?? '')
  const [keySaved, setKeySaved] = useState(false)
  const [toast, setToast] = useState('')
  const [driveScans, setDriveScans] = useState({})
  const [tmdbProbe, setTmdbProbe] = useState({ status: 'idle', message: '' })
  const toastTimer = useRef(null)

  useNavigation({ BACK: () => navigate(-1) })

  async function handleScanDrive(device) {
    setDriveScans(prev => ({ ...prev, [device.key]: { status: 'scanning', entries: [] } }))
    try {
      const entries = await listDirectory(device.rootPath)
      setDriveScans(prev => ({
        ...prev,
        [device.key]: {
          status: entries.length === 0 ? 'empty' : 'ok',
          entries: entries.map(entry => entry.name + (entry.isDirectory ? '/' : '')),
        },
      }))
    } catch (error) {
      setDriveScans(prev => ({
        ...prev,
        [device.key]: { status: 'error', entries: [String(error)] },
      }))
    }
  }

  function showToast(message) {
    setToast(message)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2500)
  }

  function handleSaveKey() {
    if (apiKey.trim()) setTmdbApiKey(apiKey.trim())
    setKeySaved(true)
    showToast('API key saved')
  }

  function handleClearMeta() {
    clearMetadataCache()
    showToast('Metadata cache cleared')
  }

  function handleClearProgress() {
    clearAllProgress()
    showToast('Watch progress cleared')
  }

  function handleRescan() {
    rescan()
    navigate('/')
  }

  async function handleProbeTmdb() {
    const sampleMovie = library.movies[0]
    const sampleSeries = library.series[0]
    const sample = sampleMovie
      ? { kind: 'movie', title: sampleMovie.title, year: sampleMovie.year }
      : sampleSeries
        ? { kind: 'tv', title: sampleSeries.title, year: sampleSeries.year }
        : null

    if (!sample) {
      setTmdbProbe({ status: 'error', message: 'No movie or series available to test.' })
      return
    }

    setTmdbProbe({
      status: 'running',
      message: `Testing ${sample.kind} lookup for "${sample.title}"...`,
    })

    const result = sample.kind === 'movie'
      ? await resolveMovie(sample.title, sample.year)
      : await resolveTv(sample.title, sample.year)

    if (!result) {
      setTmdbProbe({
        status: 'error',
        message: `No TMDB result for "${sample.title}". This points to network/API failure or a bad match.`,
      })
      return
    }

    setTmdbProbe({
      status: 'ok',
      message: `TMDB responded for "${sample.title}" (${result.id})${result.poster_path ? ' with poster.' : ' without poster.'}`,
    })
  }

  const scannedAt = library.scannedAt
    ? new Date(library.scannedAt).toLocaleString()
    : 'Never'

  const storageSummary = [
    `${devices.length} drive${devices.length === 1 ? '' : 's'} detected`,
    `${library.movies.length} movies`,
    `${library.series.length} series`,
    `${library.audiobooks.length} audiobooks`,
    `${library.music.length} music artists`,
    `Scanned ${scannedAt}`,
  ].join(' · ')

  const tmdbStats = summarizeTmdb(library)

  return (
    <div className="h-full min-h-0 flex flex-col bg-surface overflow-hidden">
      <div className="flex-none px-safe pt-10 pb-6 flex items-center gap-6">
        <FocusRing
          className="text-text-secondary cursor-pointer"
          onClick={() => navigate(-1)}
          onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
        >
          Back
        </FocusRing>
        <h1 className="text-3xl font-bold text-text-primary">Settings</h1>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-safe pb-24 space-y-10">
        <Section title="Storage">
          <SettingRow label="Connected Storage" description={storageSummary}>
            <FocusRing
              className="px-6 py-2 bg-white/10 text-text-primary rounded-card text-sm cursor-pointer"
              onClick={handleRescan}
              onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
            >
              Rescan All
            </FocusRing>
          </SettingRow>

          <div className="py-5">
            <p className="text-xs text-text-muted uppercase tracking-widest mb-4">
              Detected Drives
            </p>
            <div className="grid gap-4">
              {devices.length > 0 ? devices.map(device => {
                const scan = driveScans[device.key]
                return (
                  <div key={device.key} className="rounded-card bg-white/5 px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text-primary">{device.label}</p>
                        <p className="text-xs mt-1 text-text-muted font-mono">{device.rootPath}</p>
                      </div>
                      <FocusRing
                        className="flex-none px-4 py-1.5 bg-white/10 text-text-secondary rounded text-xs cursor-pointer"
                        onClick={() => handleScanDrive(device)}
                        onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
                      >
                        {scan?.status === 'scanning' ? 'Scanning...' : 'Scan Root'}
                      </FocusRing>
                    </div>

                    {scan && scan.status !== 'scanning' && (
                      <div className="mt-3 pt-3 border-t border-white/10">
                        {scan.status === 'error' && (
                          <p className="text-xs text-red-400">Error: {scan.entries[0]}</p>
                        )}
                        {scan.status === 'empty' && (
                          <p className="text-xs text-yellow-400">
                            Drive accessible but root is empty, or read permission is failing.
                          </p>
                        )}
                        {scan.status === 'ok' && (
                          <>
                            <p className="text-xs text-text-muted mb-1">
                              Root folders ({scan.entries.length}):
                            </p>
                            <p className="text-xs text-text-secondary font-mono leading-relaxed break-all">
                              {scan.entries.join(' · ')}
                            </p>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )
              }) : (
                <p className="text-sm text-text-secondary">No drives detected.</p>
              )}
            </div>
          </div>

          <div className="py-5">
            <FocusRing
              className="px-6 py-2 bg-white/5 text-text-secondary rounded-card text-sm cursor-pointer"
              onClick={() => {
                refreshDevices({ forceRescan: true })
                navigate('/')
              }}
              onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
            >
              Detect Drives Again
            </FocusRing>
          </div>
        </Section>

        <Section title="Metadata">
          <SettingRow
            label="TMDB API Key"
            description="Override the built-in key. Leave blank to use the default from the build."
          >
            <div className="flex items-center gap-3">
              <input
                type="password"
                value={apiKey}
                onChange={e => {
                  setApiKey(e.target.value)
                  setKeySaved(false)
                }}
                placeholder="Paste key here"
                className="bg-white/10 text-text-primary placeholder-text-muted rounded px-3 py-2 text-sm w-52 focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <FocusRing
                className={`px-5 py-2 rounded-card text-sm font-semibold cursor-pointer ${
                  keySaved ? 'bg-green-700 text-white' : 'bg-accent text-surface'
                }`}
                onClick={handleSaveKey}
                onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
              >
                {keySaved ? 'Saved' : 'Save'}
              </FocusRing>
            </div>
          </SettingRow>

          <SettingRow
            label="Clear Metadata Cache"
            description="Removes all cached TMDB posters and details. Re-fetched on next launch."
          >
            <FocusRing
              className="px-6 py-2 bg-white/10 text-text-primary rounded-card text-sm cursor-pointer"
              onClick={handleClearMeta}
              onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
            >
              Clear
            </FocusRing>
          </SettingRow>

          <div className="py-5 space-y-4">
            <div className="rounded-card bg-white/5 px-5 py-4">
              <p className="text-sm font-semibold text-text-primary">TMDB Diagnostics</p>
              <div className="mt-3 grid gap-2 text-xs text-text-secondary">
                <p>API key configured: {tmdbStats.apiConfigured ? 'Yes' : 'No'}</p>
                <p>Movie matches: {tmdbStats.movieMatches} / {tmdbStats.movieCount}</p>
                <p>Series matches: {tmdbStats.seriesMatches} / {tmdbStats.seriesCount}</p>
                <p>Movie posters available: {tmdbStats.moviePosters} / {tmdbStats.movieCount}</p>
                <p>Series posters available: {tmdbStats.seriesPosters} / {tmdbStats.seriesCount}</p>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <FocusRing
                  className="px-4 py-2 bg-white/10 text-text-primary rounded text-xs cursor-pointer"
                  onClick={handleProbeTmdb}
                >
                  {tmdbProbe.status === 'running' ? 'Testing...' : 'Run TMDB Test'}
                </FocusRing>
                {tmdbProbe.message && (
                  <p className={`text-xs ${
                    tmdbProbe.status === 'error' ? 'text-red-400' : 'text-text-secondary'
                  }`}>
                    {tmdbProbe.message}
                  </p>
                )}
              </div>
            </div>

            {tmdbStats.missingPosterTitles.length > 0 && (
              <div className="rounded-card bg-white/5 px-5 py-4">
                <p className="text-sm font-semibold text-text-primary">Missing Posters</p>
                <p className="text-xs text-text-muted mt-2">
                  These titles still have no stored poster path after enrichment.
                </p>
                <p className="text-xs text-text-secondary mt-3 leading-relaxed">
                  {tmdbStats.missingPosterTitles.join(' · ')}
                </p>
              </div>
            )}
          </div>

          {enriching && (
            <div className="py-3">
              <p className="text-xs text-text-muted">Fetching metadata in background...</p>
            </div>
          )}
        </Section>

        <Section title="Playback">
          <SettingRow
            label="Clear Watch Progress"
            description="Resets all resume positions. Cannot be undone."
          >
            <FocusRing
              className="px-6 py-2 bg-white/10 text-text-primary rounded-card text-sm cursor-pointer"
              onClick={handleClearProgress}
              onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
            >
              Clear
            </FocusRing>
          </SettingRow>
        </Section>
      </div>

      {toast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2 bg-surface-raised border border-white/20 rounded-card px-6 py-3 text-text-primary text-sm shadow-xl pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  )
}

function summarizeTmdb(library) {
  const apiConfigured = Boolean(getTmdbApiKey())
  const movieCount = library.movies.length
  const seriesCount = library.series.length
  const movieMatches = library.movies.filter(item => item.tmdbId).length
  const seriesMatches = library.series.filter(item => item.tmdbId).length
  const moviePosters = library.movies.filter(item => item.posterPath).length
  const seriesPosters = library.series.filter(item => item.posterPath).length
  const missingPosterTitles = [...library.movies, ...library.series]
    .filter(item => item.tmdbId && !item.posterPath)
    .slice(0, 12)
    .map(item => item.title)

  return {
    apiConfigured,
    movieCount,
    seriesCount,
    movieMatches,
    seriesMatches,
    moviePosters,
    seriesPosters,
    missingPosterTitles,
  }
}
