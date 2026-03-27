import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FocusRing from '../components/FocusRing.jsx'
import useNavigation from '../hooks/useNavigation.js'
import { useLibrary } from '../context/LibraryContext.jsx'
import { posterUrl, backdropUrl } from '../services/tmdb.js'
import { getAllProgress, getProgress } from '../services/metadataCache.js'
import { isUnsupportedFormat } from '../services/filenameParser.js'

const PLACEHOLDER_COLORS = [
  'bg-blue-950', 'bg-orange-950', 'bg-amber-950', 'bg-red-950',
  'bg-teal-950', 'bg-cyan-950', 'bg-yellow-950', 'bg-green-950',
  'bg-slate-800', 'bg-neutral-800', 'bg-indigo-950', 'bg-violet-950',
]

function placeholderColor(id) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PLACEHOLDER_COLORS[h % PLACEHOLDER_COLORS.length]
}

function formatEpisodeLabel(episode) {
  if (!episode) return ''
  const season = String(episode.season ?? 1).padStart(2, '0')
  const number = String(episode.episode ?? 1).padStart(2, '0')
  return `S${season}E${number}`
}

function MediaCard({ item, onSelect }) {
  const poster = item.posterPath ? posterUrl(item.posterPath, 'medium') : null
  const filePath = item.filePath ?? item.seasons?.[0]?.episodes?.[0]?.filePath ?? null
  const unsupported = isUnsupportedFormat(filePath)
  const subtitle = item.cardSubtitle ?? item.year ?? ''

  return (
    <FocusRing
      className="scale-on-focus flex-shrink-0 w-36 rounded-card cursor-pointer transition-transform duration-300"
      onFocus={e =>
        e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
      }
      onClick={() => onSelect(item)}
    >
      <div className={`relative w-full aspect-[2/3] rounded-card overflow-hidden flex items-end ${poster ? '' : placeholderColor(item.id)}`}>
        {poster ? (
          <img src={poster} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <div className="p-3">
            <p className="text-sm font-semibold text-text-primary leading-tight line-clamp-2">
              {item.title}
            </p>
            {subtitle && (
              <p className="text-xs text-text-secondary mt-1 line-clamp-2">{subtitle}</p>
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
}

function CategoryRow({ rowKey, label, items, onSelect, active, onActivate }) {
  if (!items.length) return null

  return (
    <section
      className={`shelf-row relative transition-all duration-300 ${
        active ? 'z-10 scale-[1.04] opacity-100' : 'scale-100 opacity-75'
      }`}
      onMouseEnter={() => onActivate(rowKey)}
      onFocusCapture={() => onActivate(rowKey)}
    >
      <h2 className="text-xl font-semibold text-text-primary mb-4 px-safe">{label}</h2>
      <div className="flex gap-4 overflow-x-auto hide-scrollbar py-6 px-safe">
        {items.map(item => (
          <MediaCard key={item.id} item={item} onSelect={onSelect} />
        ))}
      </div>
    </section>
  )
}

export default function HomeScreen() {
  const navigate = useNavigate()
  const {
    library,
    itemById,
    genreCollections,
    devices,
    loading,
    detectingDevices,
    refreshDevices,
    rescan,
  } = useLibrary()
  const [activeRow, setActiveRow] = useState('continue-watching')

  useNavigation({
    BACK: () => {
      try {
        if (typeof tizen !== 'undefined') tizen.application.getCurrentApplication().exit()
      } catch (_) {}
    },
    RED: () => navigate('/search'),
    YELLOW: () => navigate('/settings'),
  })

  const featured = useMemo(() => {
    if (library.movies[0]) return { ...library.movies[0], type: 'movie' }
    if (library.series[0]) return { ...library.series[0], type: 'tv' }
    return null
  }, [library.movies, library.series])

  const continueWatching = useMemo(() => {
    const movieCards = []
    const latestEpisodeByShow = new Map()

    for (const progress of getAllProgress()) {
      const pct = progress.duration > 0 ? progress.position / progress.duration : 0
      if (pct >= 0.95) continue

      const movie = library.movies.find(item => item.id === progress.mediaId)
      if (movie) {
        movieCards.push({ ...movie, _progress: progress })
        continue
      }

      for (const show of library.series) {
        for (const season of show.seasons ?? []) {
          const episode = season.episodes?.find(entry => entry.id === progress.mediaId)
          if (!episode) continue

          const current = latestEpisodeByShow.get(show.id)
          if (!current || progress.updatedAt > current._progress.updatedAt) {
            latestEpisodeByShow.set(show.id, {
              ...show,
              _progress: progress,
              resumeEpisode: episode,
              cardSubtitle: formatEpisodeLabel(episode),
            })
          }
        }
      }
    }

    return [...movieCards, ...latestEpisodeByShow.values()]
      .sort((a, b) => b._progress.updatedAt - a._progress.updatedAt)
      .slice(0, 12)
  }, [library.movies, library.series, itemById])

  const featuredGenres = useMemo(
    () => genreCollections.filter(group => group.items.length >= 1).slice(0, 6),
    [genreCollections]
  )

  const showFlatRows = featuredGenres.length === 0
  const hasContent = library.movies.length > 0
    || library.series.length > 0
    || library.audiobooks.length > 0
    || library.music.length > 0

  function handleSelect(item) {
    navigate(`/detail/${item.id}`)
  }

  function playFeatured() {
    if (!featured) return

    if (featured.type === 'movie' && featured.filePath) {
      const saved = getProgress(featured.id)
      navigate(`/player/${featured.id}`, {
        state: {
          title: featured.title,
          filePath: featured.filePath,
          mediaId: featured.id,
          type: 'movie',
          resumePosition: saved?.position ?? 0,
        },
      })
      return
    }

    navigate(`/detail/${featured.id}`)
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface">
        <p className="text-text-secondary text-xl">Scanning library...</p>
      </div>
    )
  }

  if (devices.length === 0 && !detectingDevices) {
    return (
      <NoDeviceScreen onRefresh={() => refreshDevices({ forceRescan: true })} />
    )
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-surface overflow-hidden">
      {featured ? (
        <div
          className="h-[400px] flex-none relative"
          style={featured.backdropPath
            ? {
                backgroundImage: `url(${backdropUrl(featured.backdropPath, 'large')})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : {}}
        >
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
                Play
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
        <div className="h-[200px] flex-none flex items-end px-safe pb-10 bg-gradient-to-b from-slate-900 to-surface">
          <div>
            <h1 className="text-4xl font-bold text-text-primary">Tooty</h1>
            {!hasContent && (
              <p className="text-text-secondary mt-2">
                No media found yet. Try rescanning the connected drives.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!hasContent ? (
          <EmptyLibraryScreen
            devices={devices}
            onDetect={() => refreshDevices({ forceRescan: true })}
            onRescan={rescan}
            onSettings={() => navigate('/settings')}
          />
        ) : (
          <div className="py-8 pb-20 space-y-10">
            {continueWatching.length > 0 && (
              <CategoryRow
                rowKey="continue-watching"
                label="Continue Watching"
                items={continueWatching}
                onSelect={handleSelect}
                active={activeRow === 'continue-watching'}
                onActivate={setActiveRow}
              />
            )}

            {showFlatRows ? (
              <>
                <CategoryRow
                  rowKey="movies"
                  label="Movies"
                  items={library.movies.slice(0, 20)}
                  onSelect={handleSelect}
                  active={activeRow === 'movies'}
                  onActivate={setActiveRow}
                />
                <CategoryRow
                  rowKey="series"
                  label="Series"
                  items={library.series.slice(0, 20)}
                  onSelect={handleSelect}
                  active={activeRow === 'series'}
                  onActivate={setActiveRow}
                />
              </>
            ) : (
              featuredGenres.map(group => (
                <CategoryRow
                  rowKey={`genre:${group.name}`}
                  key={group.name}
                  label={group.name}
                  items={group.items.slice(0, 12)}
                  onSelect={handleSelect}
                  active={activeRow === `genre:${group.name}`}
                  onActivate={setActiveRow}
                />
              ))
            )}

            <CategoryRow
              rowKey="audiobooks"
              label="Audiobooks"
              items={library.audiobooks}
              onSelect={handleSelect}
              active={activeRow === 'audiobooks'}
              onActivate={setActiveRow}
            />
            <CategoryRow
              rowKey="music"
              label="Music"
              items={library.music.map(artist => ({ ...artist, title: artist.name }))}
              onSelect={() => navigate('/browse/music')}
              active={activeRow === 'music'}
              onActivate={setActiveRow}
            />
            <div className="h-16" />
          </div>
        )}
      </div>
    </div>
  )
}

function NoDeviceScreen({ onRefresh }) {
  return (
    <div className="h-full min-h-0 flex items-center justify-center bg-surface px-safe">
      <div className="max-w-2xl text-center">
        <p className="text-xs text-accent uppercase tracking-[0.35em] mb-4">Storage</p>
        <h1 className="text-4xl font-bold text-text-primary">No Drives Detected</h1>
        <p className="text-text-secondary mt-4 leading-relaxed">
          Tooty could not find a connected storage device. Check the USB or HDD connection, then try again.
        </p>
        <FocusRing
          className="inline-flex items-center mt-8 px-8 py-3 rounded-card bg-accent text-surface font-semibold cursor-pointer"
          onClick={onRefresh}
        >
          Retry Detection
        </FocusRing>
      </div>
    </div>
  )
}

function EmptyLibraryScreen({ devices, onDetect, onRescan, onSettings }) {
  return (
    <div className="px-safe py-10">
      <div className="max-w-3xl rounded-card border border-white/10 bg-white/5 p-8">
        <p className="text-xs text-accent uppercase tracking-[0.35em] mb-4">Library</p>
        <h2 className="text-3xl font-bold text-text-primary">No media found on detected drives</h2>
        <p className="text-text-secondary mt-4 leading-relaxed">
          Tooty can see {devices.length} connected drive{devices.length === 1 ? '' : 's'}, but none of
          them returned recognised Movies, Series, Audiobooks, or Music folders.
        </p>

        <div className="mt-6 grid gap-3 max-w-xl">
          {devices.map(device => (
            <div
              key={device.key}
              className="rounded-card border border-white/10 bg-black/10 px-4 py-3"
            >
              <p className="text-sm font-semibold text-text-primary">{device.label}</p>
              <p className="text-xs text-text-muted mt-1">{device.rootPath}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <FocusRing
            className="inline-flex items-center px-6 py-3 rounded-card bg-accent text-surface font-semibold cursor-pointer"
            onClick={onRescan}
          >
            Rescan All Drives
          </FocusRing>
          <FocusRing
            className="inline-flex items-center px-6 py-3 rounded-card bg-white/10 text-text-primary cursor-pointer"
            onClick={onDetect}
          >
            Detect Drives Again
          </FocusRing>
          <FocusRing
            className="inline-flex items-center px-6 py-3 rounded-card bg-white/10 text-text-primary cursor-pointer"
            onClick={onSettings}
          >
            Open Settings
          </FocusRing>
        </div>
      </div>
    </div>
  )
}
