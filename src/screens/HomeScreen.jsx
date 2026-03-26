import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import FocusRing from '../components/FocusRing.jsx'
import useNavigation from '../hooks/useNavigation.js'
import { useLibrary } from '../context/LibraryContext.jsx'
import { posterUrl, backdropUrl } from '../services/tmdb.js'
import { getAllProgress, getProgress } from '../services/metadataCache.js'

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

// ─── Sub-components ──────────────────────────────────────────────────────────

function MediaCard({ item, onSelect }) {
  const poster = item.posterPath ? posterUrl(item.posterPath, 'medium') : null

  return (
    <FocusRing
      className="flex-shrink-0 w-36 rounded-card cursor-pointer"
      onFocus={e =>
        e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
      }
      onClick={() => onSelect(item)}
    >
      <div className={`w-full aspect-[2/3] rounded-card overflow-hidden flex items-end
        ${poster ? '' : placeholderColor(item.id)}`}>
        {poster ? (
          <img src={poster} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="p-3">
            <p className="text-sm font-semibold text-text-primary leading-tight line-clamp-2">
              {item.title}
            </p>
            <p className="text-xs text-text-secondary mt-1">{item.year}</p>
          </div>
        )}
      </div>
    </FocusRing>
  )
}

function CategoryRow({ label, items, onSelect }) {
  if (!items.length) return null
  return (
    <div>
      <h2 className="text-xl font-semibold text-text-primary mb-4 px-safe">{label}</h2>
      <div className="flex gap-4 overflow-x-auto pb-3 px-safe">
        {items.map(item => (
          <MediaCard key={item.id} item={item} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const navigate = useNavigate()
  const { library, itemById, loading } = useLibrary()

  useNavigation({
    BACK: () => {
      try {
        if (typeof tizen !== 'undefined') tizen.application.getCurrentApplication().exit()
      } catch (_) {}
    },
    RED:    () => navigate('/search'),
    YELLOW: () => navigate('/settings'),
  })

  // Featured: first movie or first series, with type field
  const featured = useMemo(() => {
    if (library.movies[0])  return { ...library.movies[0],  type: 'movie' }
    if (library.series[0])  return { ...library.series[0],  type: 'tv'    }
    return null
  }, [library.movies, library.series])

  // Continue Watching: cross-reference saved progress with library items
  const continueWatching = useMemo(() => {
    return getAllProgress()
      .map(p => {
        const item = itemById.get(p.mediaId)
        if (!item) return null
        const pct = p.duration > 0 ? p.position / p.duration : 0
        if (pct >= 0.95) return null // treat as finished
        return { ...item, _progress: p }
      })
      .filter(Boolean)
      .slice(0, 12)
  }, [itemById])

  function handleSelect(item) {
    navigate(`/detail/${item.id}`)
  }

  function playFeatured() {
    if (!featured) return
    // For movies we have a direct file path — go straight to player
    if (featured.type === 'movie' && featured.filePath) {
      const saved = getProgress(featured.id)
      navigate(`/player/${featured.id}`, {
        state: {
          title:          featured.title,
          filePath:       featured.filePath,
          mediaId:        featured.id,
          type:           'movie',
          resumePosition: saved?.position ?? 0,
        },
      })
    } else {
      // Series — let DetailScreen handle episode selection
      navigate(`/detail/${featured.id}`)
    }
  }

  // ── Render: loading ───────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface">
        <p className="text-text-secondary text-xl">Scanning library…</p>
      </div>
    )
  }

  const hasContent = library.movies.length > 0
    || library.series.length > 0
    || library.audiobooks.length > 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col bg-surface overflow-hidden">

      {/* ── Hero banner ────────────────────────────────────────────────── */}
      {featured ? (
        <div
          className="h-[400px] flex-none relative"
          style={featured.backdropPath
            ? {
                backgroundImage:    `url(${backdropUrl(featured.backdropPath, 'large')})`,
                backgroundSize:     'cover',
                backgroundPosition: 'center',
              }
            : {}}
        >
          {/* Gradients so text is always readable over any backdrop */}
          <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/30 to-transparent" />

          <div className="relative h-full flex flex-col justify-end px-safe pb-10">
            <p className="text-xs text-accent uppercase tracking-widest mb-2">
              {featured.type === 'tv' ? 'Series' : 'Movie'}
              {featured.year ? ` · ${featured.year}` : ''}
            </p>
            <h1 className="text-5xl font-bold text-text-primary mb-3">{featured.title}</h1>
            {featured.overview && (
              <p className="text-base text-text-secondary mb-8 max-w-xl line-clamp-2">
                {featured.overview}
              </p>
            )}
            <div className="flex gap-4">
              <FocusRing
                className="bg-accent text-surface rounded-card px-8 py-3 font-semibold text-base cursor-pointer"
                onClick={playFeatured}
                onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
              >
                ▶  Play
              </FocusRing>
              <FocusRing
                className="bg-white/10 text-text-primary rounded-card px-8 py-3 font-semibold text-base cursor-pointer"
                onClick={() => handleSelect(featured)}
                onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
              >
                More Info
              </FocusRing>
            </div>
          </div>
        </div>
      ) : (
        // No content state
        <div className="h-[200px] flex-none flex items-end px-safe pb-10 bg-gradient-to-b from-slate-900 to-surface">
          <div>
            <h1 className="text-4xl font-bold text-text-primary">Tooty</h1>
            {!hasContent && (
              <p className="text-text-secondary mt-2">
                No media found — connect a drive and restart.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Category rows ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="py-8 space-y-10">
          {continueWatching.length > 0 && (
            <CategoryRow
              label="Continue Watching"
              items={continueWatching}
              onSelect={handleSelect}
            />
          )}
          <CategoryRow label="Movies"     items={library.movies}     onSelect={handleSelect} />
          <CategoryRow label="Series"     items={library.series}     onSelect={handleSelect} />
          <CategoryRow label="Audiobooks" items={library.audiobooks} onSelect={handleSelect} />
          <div className="h-8" />
        </div>
      </div>

    </div>
  )
}
