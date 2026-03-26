import React, { useState, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import FocusRing from '../components/FocusRing.jsx'
import useNavigation from '../hooks/useNavigation.js'
import { useLibrary } from '../context/LibraryContext.jsx'
import { posterUrl } from '../services/tmdb.js'

// ─── Keyboard layout ─────────────────────────────────────────────────────────

// _SPACE_ and _DEL_ are special tokens rendered as labelled buttons
const KB_ROWS = [
  ['A','B','C','D','E','F','G','H','I','J','K','L','M'],
  ['N','O','P','Q','R','S','T','U','V','W','X','Y','Z'],
  ['1','2','3','4','5','6','7','8','9','0','_DEL_','_SPACE_'],
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLACEHOLDER_COLORS = [
  'bg-blue-950', 'bg-orange-950', 'bg-amber-950', 'bg-red-950',
  'bg-teal-950', 'bg-cyan-950',   'bg-green-950', 'bg-slate-800',
]

function placeholderColor(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PLACEHOLDER_COLORS[h % PLACEHOLDER_COLORS.length]
}

function searchLibrary(library, query) {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  const results = []
  for (const item of library.movies) {
    if (item.title?.toLowerCase().includes(q)) results.push({ ...item, type: 'movie' })
  }
  for (const item of library.series) {
    if (item.title?.toLowerCase().includes(q)) results.push({ ...item, type: 'tv' })
  }
  for (const item of library.audiobooks) {
    if (
      item.title?.toLowerCase().includes(q) ||
      item.author?.toLowerCase().includes(q)
    ) {
      results.push({ ...item, type: 'audiobook' })
    }
  }
  return results
}

const TYPE_LABEL = { movie: 'Movie', tv: 'Series', audiobook: 'Audiobook', music: 'Music' }

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const navigate      = useNavigate()
  const { library }   = useLibrary()
  const [query, setQuery] = useState('')

  useNavigation({ BACK: () => navigate(-1) })

  const results = useMemo(() => searchLibrary(library, query), [library, query])

  const handleKey = useCallback((key) => {
    if (key === '_DEL_')   setQuery(q => q.slice(0, -1))
    else if (key === '_SPACE_') setQuery(q => (q.endsWith(' ') ? q : q + ' '))
    else                   setQuery(q => q + key)
  }, [])

  return (
    <div className="h-full flex bg-surface overflow-hidden">

      {/* ── Results panel (left 55%) ──────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Query display */}
        <div className="flex-none px-safe pt-10 pb-6 border-b border-white/10">
          <p className="text-xs text-text-muted uppercase tracking-widest mb-2">Search</p>
          <div className="flex items-baseline gap-4 min-w-0">
            <h1 className="text-4xl font-bold text-text-primary truncate">
              {query
                ? query
                : <span className="text-text-muted font-normal">Start typing…</span>}
            </h1>
            {query.trim() && (
              <span className="text-text-muted text-sm flex-none">
                {results.length} result{results.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Result list */}
        <div className="flex-1 overflow-y-auto px-safe py-4">
          {query.trim() && results.length === 0 && (
            <p className="text-text-muted mt-4">No results for "{query.trim()}"</p>
          )}
          <div className="space-y-1">
            {results.map(item => {
              const poster = item.posterPath ? posterUrl(item.posterPath, 'small') : null
              return (
                <FocusRing
                  key={item.id}
                  className="flex items-center gap-4 px-4 py-3 rounded-card cursor-pointer hover:bg-white/5"
                  onClick={() => navigate(`/detail/${item.id}`)}
                  onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
                >
                  {/* Mini poster */}
                  <div className={`flex-none w-10 aspect-[2/3] rounded overflow-hidden
                    ${poster ? '' : placeholderColor(item.id)}`}>
                    {poster && (
                      <img src={poster} alt={item.title} className="w-full h-full object-cover" />
                    )}
                  </div>
                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">{item.title}</p>
                    <p className="text-xs text-text-muted">
                      {TYPE_LABEL[item.type] ?? item.type}
                      {item.year ? ` · ${item.year}` : ''}
                      {item.author ? ` · ${item.author}` : ''}
                    </p>
                  </div>
                </FocusRing>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Keyboard panel (right ~45%) ──────────────────────────────── */}
      <div className="flex-none w-[500px] flex flex-col justify-center px-8 py-10 border-l border-white/10">
        <div className="space-y-2">
          {KB_ROWS.map((row, ri) => (
            <div key={ri} className="flex gap-1.5">
              {row.map(key => (
                <FocusRing
                  key={key}
                  className={`flex items-center justify-center h-11 rounded text-sm font-semibold
                    cursor-pointer bg-white/10 text-text-primary
                    ${key === '_SPACE_' ? 'flex-[3]' : key === '_DEL_' ? 'flex-[2]' : 'flex-1'}`}
                  onClick={() => handleKey(key)}
                  onFocus={e =>
                    e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                  }
                >
                  {key === '_SPACE_' ? 'Space' : key === '_DEL_' ? '⌫' : key}
                </FocusRing>
              ))}
            </div>
          ))}
        </div>

        {/* Utility row */}
        <div className="mt-4 flex gap-2">
          <FocusRing
            className="flex-1 h-10 flex items-center justify-center rounded
              bg-white/5 text-text-secondary text-sm cursor-pointer"
            onClick={() => setQuery('')}
            onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
          >
            Clear
          </FocusRing>
          <FocusRing
            className="flex-none h-10 px-6 flex items-center justify-center rounded
              bg-white/10 text-text-secondary text-sm cursor-pointer"
            onClick={() => navigate(-1)}
            onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
          >
            ← Back
          </FocusRing>
        </div>
      </div>

    </div>
  )
}
