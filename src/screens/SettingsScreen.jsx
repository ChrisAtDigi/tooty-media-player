import React, { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import FocusRing from '../components/FocusRing.jsx'
import useNavigation from '../hooks/useNavigation.js'
import { useLibrary } from '../context/LibraryContext.jsx'
import { getTmdbApiKey, setTmdbApiKey } from '../services/tmdb.js'
import { clearMetadataCache, clearAllProgress } from '../services/metadataCache.js'

// ─── Layout helpers ───────────────────────────────────────────────────────────

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
        {description && (
          <p className="text-xs text-text-muted mt-1">{description}</p>
        )}
      </div>
      <div className="flex-none">{children}</div>
    </div>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const navigate = useNavigate()
  const { library, device, enriching, rescan } = useLibrary()

  const [apiKey,   setApiKey]   = useState(getTmdbApiKey() ?? '')
  const [keySaved, setKeySaved] = useState(false)
  const [toast,    setToast]    = useState('')
  const toastTimer = useRef(null)

  useNavigation({ BACK: () => navigate(-1) })

  function showToast(msg) {
    setToast(msg)
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

  const scannedAt = library.scannedAt
    ? new Date(library.scannedAt).toLocaleString()
    : 'Never'

  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex-none px-safe pt-10 pb-6 flex items-center gap-6">
        <FocusRing
          className="text-text-secondary cursor-pointer"
          onClick={() => navigate(-1)}
          onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
        >
          ← Back
        </FocusRing>
        <h1 className="text-3xl font-bold text-text-primary">Settings</h1>
      </div>

      {/* ── Content ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-safe pb-16 space-y-10">

        {/* Storage */}
        {device && (
          <Section title="Storage">
            <SettingRow
              label={device.label}
              description={[
                `${library.movies.length} movies`,
                `${library.series.length} series`,
                `${library.audiobooks.length} audiobooks`,
                `Scanned ${scannedAt}`,
              ].join(' · ')}
            >
              <FocusRing
                className="px-6 py-2 bg-white/10 text-text-primary rounded-card text-sm cursor-pointer"
                onClick={handleRescan}
                onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
              >
                Rescan
              </FocusRing>
            </SettingRow>
          </Section>
        )}

        {/* Metadata */}
        <Section title="Metadata">
          <SettingRow
            label="TMDB API Key"
            description="Override the built-in key. Leave blank to use the default from the build."
          >
            <div className="flex items-center gap-3">
              <input
                type="password"
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setKeySaved(false) }}
                placeholder="Paste key here"
                className="bg-white/10 text-text-primary placeholder-text-muted rounded px-3 py-2
                  text-sm w-52 focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <FocusRing
                className={`px-5 py-2 rounded-card text-sm font-semibold cursor-pointer
                  ${keySaved ? 'bg-green-700 text-white' : 'bg-accent text-surface'}`}
                onClick={handleSaveKey}
                onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
              >
                {keySaved ? 'Saved ✓' : 'Save'}
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

          {enriching && (
            <div className="py-3">
              <p className="text-xs text-text-muted">Fetching metadata in background…</p>
            </div>
          )}
        </Section>

        {/* Playback */}
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

      {/* ── Toast ──────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-10 left-1/2 -translate-x-1/2
          bg-surface-raised border border-white/20 rounded-card px-6 py-3
          text-text-primary text-sm shadow-xl pointer-events-none">
          {toast}
        </div>
      )}

    </div>
  )
}
