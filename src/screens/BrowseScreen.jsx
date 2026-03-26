import React, { useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import FocusRing from '../components/FocusRing.jsx'
import useNavigation from '../hooks/useNavigation.js'
import { useLibrary } from '../context/LibraryContext.jsx'
import { posterUrl } from '../services/tmdb.js'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PLACEHOLDER_COLORS = [
  'bg-blue-950', 'bg-orange-950', 'bg-amber-950', 'bg-red-950',
  'bg-teal-950', 'bg-cyan-950',   'bg-yellow-950', 'bg-green-950',
  'bg-slate-800', 'bg-neutral-800', 'bg-indigo-950', 'bg-violet-950',
]

function placeholderColor(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PLACEHOLDER_COLORS[h % PLACEHOLDER_COLORS.length]
}

const CATEGORY_LABELS = {
  movies:     'Movies',
  series:     'Series',
  audiobooks: 'Audiobooks',
  music:      'Music',
}

const SORTS = ['Title A–Z', 'Title Z–A', 'Year ↓', 'Year ↑']

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function BrowseScreen() {
  const { category } = useParams()
  const navigate     = useNavigate()
  const { library }  = useLibrary()
  const [sortIdx, setSortIdx] = useState(2) // default: Year ↓

  useNavigation({
    BACK: () => navigate(-1),
    RED:  () => navigate('/search'),
  })

  const rawItems = library[category] ?? []

  const items = useMemo(() => {
    const list = [...rawItems]
    switch (SORTS[sortIdx]) {
      case 'Title A–Z': return list.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
      case 'Title Z–A': return list.sort((a, b) => (b.title ?? '').localeCompare(a.title ?? ''))
      case 'Year ↓':    return list.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
      case 'Year ↑':    return list.sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
      default:          return list
    }
  }, [rawItems, sortIdx])

  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex-none px-safe pt-10 pb-6 flex items-center gap-8">
        <FocusRing
          className="text-text-secondary cursor-pointer"
          onClick={() => navigate(-1)}
          onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
        >
          ← Back
        </FocusRing>
        <h1 className="text-3xl font-bold text-text-primary">
          {CATEGORY_LABELS[category] ?? category}
        </h1>
        {/* Sort controls */}
        <div className="ml-auto flex gap-2">
          {SORTS.map((s, i) => (
            <FocusRing
              key={s}
              className={`px-4 py-1.5 rounded-full text-sm cursor-pointer
                ${i === sortIdx
                  ? 'bg-accent text-surface font-semibold'
                  : 'bg-white/10 text-text-secondary'}`}
              onClick={() => setSortIdx(i)}
              onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
            >
              {s}
            </FocusRing>
          ))}
        </div>
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-safe pb-8">
        {items.length === 0 ? (
          <p className="text-text-secondary mt-8">No items in this category.</p>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))' }}>
            {items.map(item => {
              const poster = item.posterPath ? posterUrl(item.posterPath, 'medium') : null
              return (
                <FocusRing
                  key={item.id}
                  className="cursor-pointer rounded-card"
                  onClick={() => navigate(`/detail/${item.id}`)}
                  onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
                >
                  <div className={`w-full aspect-[2/3] rounded-card overflow-hidden flex items-end
                    ${poster ? '' : placeholderColor(item.id)}`}>
                    {poster ? (
                      <img src={poster} alt={item.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="p-2">
                        <p className="text-xs font-semibold text-text-primary line-clamp-2">
                          {item.title}
                        </p>
                        <p className="text-xs text-text-muted">{item.year}</p>
                      </div>
                    )}
                  </div>
                </FocusRing>
              )
            })}
          </div>
        )}
      </div>

    </div>
  )
}
