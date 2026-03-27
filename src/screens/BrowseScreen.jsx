import React, { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import FocusRing from '../components/FocusRing.jsx'
import useNavigation from '../hooks/useNavigation.js'
import { useLibrary } from '../context/LibraryContext.jsx'
import { posterUrl } from '../services/tmdb.js'
import { isUnsupportedFormat } from '../services/filenameParser.js'

const PLACEHOLDER_COLORS = [
  'bg-blue-950', 'bg-orange-950', 'bg-amber-950', 'bg-red-950',
  'bg-teal-950', 'bg-cyan-950',   'bg-yellow-950', 'bg-green-950',
  'bg-slate-800', 'bg-neutral-800', 'bg-indigo-950', 'bg-violet-950',
]

const CATEGORY_LABELS = {
  movies:     'Movies',
  series:     'Series',
  audiobooks: 'Audiobooks',
  music:      'Music',
}

const SORTS = ['Title A-Z', 'Title Z-A', 'Year Newest', 'Year Oldest']

export default function BrowseScreen() {
  const { category } = useParams()
  const navigate = useNavigate()
  const { library } = useLibrary()
  const [sortIdx, setSortIdx] = useState(2)

  useNavigation({
    BACK: () => navigate(-1),
    RED:  () => navigate('/search'),
  })

  const rawItems = library[category] ?? []

  const items = useMemo(() => {
    const list = [...rawItems]
    switch (SORTS[sortIdx]) {
      case 'Title A-Z':
        return list.sort((a, b) => itemTitle(a).localeCompare(itemTitle(b)))
      case 'Title Z-A':
        return list.sort((a, b) => itemTitle(b).localeCompare(itemTitle(a)))
      case 'Year Newest':
        return list.sort((a, b) => (b.year ?? 0) - (a.year ?? 0))
      case 'Year Oldest':
        return list.sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
      default:
        return list
    }
  }, [rawItems, sortIdx])

  function handleSelect(item) {
    if (category === 'music') return
    navigate(`/detail/${item.id}`)
  }

  const isMusic = category === 'music'

  return (
    <div className="h-full min-h-0 flex flex-col bg-surface overflow-hidden">
      <div className="flex-none px-safe pt-10 pb-6 flex items-center gap-8">
        <FocusRing
          className="text-text-secondary cursor-pointer"
          onClick={() => navigate(-1)}
          onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
        >
          Back
        </FocusRing>
        <h1 className="text-3xl font-bold text-text-primary">
          {CATEGORY_LABELS[category] ?? category}
        </h1>
        {!isMusic && (
          <div className="ml-auto flex gap-2">
            {SORTS.map((sort, idx) => (
              <FocusRing
                key={sort}
                className={`px-4 py-1.5 rounded-full text-sm cursor-pointer ${
                  idx === sortIdx
                    ? 'bg-accent text-surface font-semibold'
                    : 'bg-white/10 text-text-secondary'
                }`}
                onClick={() => setSortIdx(idx)}
                onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
              >
                {sort}
              </FocusRing>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-safe pt-6 pb-20">
        {items.length === 0 ? (
          <p className="text-text-secondary mt-8">No items in this category.</p>
        ) : isMusic ? (
          // ── Music: grouped by artist ──────────────────────────────────────
          <div className="space-y-10">
            {items.map(artist => {
              const totalTracks = artist.albums.reduce((n, a) => n + a.tracks.length, 0)
              return (
                <div key={artist.id}>
                  <div className="flex items-baseline gap-3 mb-4">
                    <h2 className="text-lg font-semibold text-text-primary">{artist.name}</h2>
                    <span className="text-sm text-text-muted">
                      {artist.albums.length} album{artist.albums.length !== 1 ? 's' : ''} · {totalTracks} track{totalTracks !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
                    {artist.albums.map(album => (
                      <div key={album.id} className="flex-none w-36">
                        <div className={`w-full aspect-square rounded-card overflow-hidden flex items-end p-3 ${placeholderColor(album.id)}`}>
                          <p className="text-xs font-semibold text-text-primary line-clamp-2 leading-tight">
                            {album.title}
                          </p>
                        </div>
                        <p className="text-xs text-text-muted mt-1.5 truncate">
                          {album.tracks.length} track{album.tracks.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          // ── Movies / Series / Audiobooks: poster grid ─────────────────────
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(9rem, 1fr))' }}>
            {items.map(item => {
              const title = itemTitle(item)
              const subtitle = itemSubtitle(item, category)
              const poster = item.posterPath ? posterUrl(item.posterPath, 'medium') : null
              const filePath = item.filePath ?? item.seasons?.[0]?.episodes?.[0]?.filePath ?? null
              const unsupported = isUnsupportedFormat(filePath)

              return (
                <FocusRing
                  key={item.id}
                  className="scale-on-focus cursor-pointer rounded-card transition-transform duration-300"
                  onClick={() => handleSelect(item)}
                  onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
                >
                  <div
                    className={`relative w-full aspect-[2/3] rounded-card overflow-hidden flex items-end ${
                      poster ? '' : placeholderColor(item.id)
                    }`}
                  >
                    {poster ? (
                      <img src={poster} alt={title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="p-2">
                        <p className="text-xs font-semibold text-text-primary line-clamp-2">
                          {title}
                        </p>
                        {subtitle && (
                          <p className="text-xs text-text-muted line-clamp-2">{subtitle}</p>
                        )}
                      </div>
                    )}
                    {unsupported && (
                      <div className="absolute top-2 left-0 right-0 flex justify-center">
                        <span className="bg-red-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                          NOT SUPPORTED
                        </span>
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

function placeholderColor(id) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return PLACEHOLDER_COLORS[hash % PLACEHOLDER_COLORS.length]
}

function itemTitle(item) {
  return item.title ?? item.name ?? 'Untitled'
}

function itemSubtitle(item, category) {
  if (category === 'music') {
    const albumCount = item.albums?.length ?? 0
    const trackCount = (item.albums ?? []).reduce((count, album) => count + (album.tracks?.length ?? 0), 0)
    return `${albumCount} album${albumCount === 1 ? '' : 's'} · ${trackCount} track${trackCount === 1 ? '' : 's'}`
  }

  if (category === 'audiobooks' && item.author) return item.author
  if (item.year) return String(item.year)
  return ''
}
