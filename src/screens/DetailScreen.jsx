import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import FocusRing from '../components/FocusRing.jsx'
import useNavigation from '../hooks/useNavigation.js'
import { useLibrary } from '../context/LibraryContext.jsx'
import {
  fetchMovieDetails,
  fetchTvDetails,
  fetchTvSeasonDetails,
  posterUrl,
  backdropUrl,
} from '../services/tmdb.js'
import { getProgress } from '../services/metadataCache.js'

export default function DetailScreen() {
  const { id }    = useParams()
  const navigate  = useNavigate()
  const { itemById } = useLibrary()

  const item = itemById.get(id) ?? null

  const [tmdb,           setTmdb]           = useState(null)
  const [selectedSeason, setSelectedSeason] = useState(null)
  const [seasonDetails,  setSeasonDetails]  = useState({})
  const loadedSeasonsRef = useRef(new Set())

  useNavigation({
    BACK: () => navigate(-1),
    RED:  () => navigate('/search'),
  })

  useEffect(() => {
    if (!item?.tmdbId) return
    let cancelled = false
    async function load() {
      const data = item.type === 'tv'
        ? await fetchTvDetails(item.tmdbId)
        : await fetchMovieDetails(item.tmdbId)
      if (!cancelled) setTmdb(data)
    }
    load()
    return () => { cancelled = true }
  }, [item?.id, item?.tmdbId, item?.type]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const seasons = item?.seasons ?? []
    if (seasons.length === 0) {
      setSelectedSeason(null)
      return
    }

    const inProgressSeason = seasons.find(season =>
      season.episodes.some(ep => {
        const progress = getProgress(ep.id)
        if (!progress || progress.duration <= 0) return false
        const pct = progress.position / progress.duration
        return pct > 0 && pct < 0.95
      })
    )

    setSelectedSeason(inProgressSeason?.seasonNumber ?? seasons[0].seasonNumber)
  }, [item?.id, item?.seasons])

  useEffect(() => {
    setSeasonDetails({})
    loadedSeasonsRef.current.clear()
  }, [item?.id])

  useEffect(() => {
    const seasonNumber = selectedSeason
    if (item?.type !== 'tv' || !item?.tmdbId || !seasonNumber) return
    if (loadedSeasonsRef.current.has(seasonNumber)) return

    let cancelled = false
    async function loadSeason() {
      const data = await fetchTvSeasonDetails(item.tmdbId, seasonNumber)
      if (cancelled || !data) return
      loadedSeasonsRef.current.add(seasonNumber)
      setSeasonDetails(prev => ({ ...prev, [seasonNumber]: data }))
    }

    loadSeason()
    return () => { cancelled = true }
  }, [item?.tmdbId, item?.type, selectedSeason])

  // ── Not found ─────────────────────────────────────────────────────────────

  if (!item) {
    return (
      <div className="h-full flex items-center justify-center bg-surface">
        <div className="text-center">
          <p className="text-text-secondary text-xl mb-4">Item not found.</p>
          <FocusRing
            className="text-text-muted cursor-pointer"
            onClick={() => navigate(-1)}
            onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
          >
            ← Back
          </FocusRing>
        </div>
      </div>
    )
  }

  // ── Derived display values ────────────────────────────────────────────────

  const backdrop = tmdb?.backdrop_path
    ? backdropUrl(tmdb.backdrop_path, 'large')
    : item.backdropPath ? backdropUrl(item.backdropPath, 'large') : null

  const poster = tmdb?.poster_path
    ? posterUrl(tmdb.poster_path, 'large')
    : item.posterPath ? posterUrl(item.posterPath, 'large') : null

  const overview = tmdb?.overview ?? item.overview ?? ''
  const genres   = (tmdb?.genres?.map(g => g.name) ?? item.genres ?? []).slice(0, 4)
  const cast     = tmdb?.credits?.cast?.slice(0, 6) ?? []
  const rating   = tmdb?.vote_average ? tmdb.vote_average.toFixed(1) : null
  const year     = item.year
    ?? tmdb?.release_date?.slice(0, 4)
    ?? tmdb?.first_air_date?.slice(0, 4)
    ?? null
  const seasons  = item.seasons ?? []
  const activeSeason = seasons.find(season => season.seasonNumber === selectedSeason) ?? seasons[0] ?? null
  const activeSeasonEpisodes = mergeSeasonEpisodes(
    activeSeason?.episodes ?? [],
    seasonDetails[activeSeason?.seasonNumber]?.episodes ?? []
  )

  // ── Play handlers ─────────────────────────────────────────────────────────

  function playMovie() {
    const saved = getProgress(item.id)
    navigate(`/player/${item.id}`, {
      state: {
        title:          item.title,
        filePath:       item.filePath,
        mediaId:        item.id,
        type:           'movie',
        resumePosition: saved?.position ?? 0,
        subtitles:      item.subtitles ?? [],
      },
    })
  }

  function playEpisode(ep) {
    const label = [
      item.title,
      `S${String(ep.season).padStart(2, '0')}E${String(ep.episode).padStart(2, '0')}`,
      ep.title,
    ].filter(Boolean).join(' · ')

    const saved = getProgress(ep.id)
    navigate(`/player/${ep.id}`, {
      state: {
        title:          label,
        filePath:       ep.filePath,
        mediaId:        ep.id,
        type:           'episode',
        resumePosition: saved?.position ?? 0,
      },
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full min-h-0 flex flex-col bg-surface overflow-hidden">

      {/* ── Backdrop hero ────────────────────────────────────────────── */}
      <div
        className="h-[380px] flex-none relative"
        style={backdrop
          ? { backgroundImage: `url(${backdrop})`, backgroundSize: 'cover', backgroundPosition: 'center top' }
          : {}}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-surface via-surface/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" />

        <div className="relative h-full flex items-end px-safe pb-10 gap-8">

          {/* Poster */}
          {poster && (
            <img
              src={poster}
              alt={item.title}
              className="flex-none w-36 aspect-[2/3] object-cover rounded-card shadow-2xl"
            />
          )}

          {/* Info block */}
          <div className="flex-1 min-w-0">
            {/* Genres + rating */}
            <div className="flex items-center flex-wrap gap-2 mb-2">
              {genres.map(g => (
                <span key={g} className="text-xs text-text-muted border border-white/20 rounded px-2 py-0.5">
                  {g}
                </span>
              ))}
              {rating && (
                <span className="text-xs text-accent ml-auto">★ {rating}</span>
              )}
            </div>

            <h1 className="text-4xl font-bold text-text-primary mb-1 line-clamp-2">{item.title}</h1>
            {year && <p className="text-sm text-text-secondary mb-4">{year}</p>}
            {overview && (
              <p className="text-sm text-text-secondary max-w-2xl line-clamp-3">{overview}</p>
            )}

            {/* Action buttons */}
            <div className="flex gap-4 mt-6">
              {item.type === 'movie' && item.filePath && (
                <FocusRing
                  className="bg-accent text-surface rounded-card px-8 py-3 font-semibold cursor-pointer"
                  onClick={playMovie}
                  onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
                >
                  ▶  Play
                </FocusRing>
              )}
              <FocusRing
                className="bg-white/10 text-text-primary rounded-card px-6 py-3 font-semibold cursor-pointer"
                onClick={() => navigate(-1)}
                onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
              >
                ← Back
              </FocusRing>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scrollable detail content ─────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-safe pt-8 pb-20 space-y-8">

        {/* Cast */}
        {cast.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-4">Cast</h2>
            <div className="flex gap-6 overflow-x-auto pb-2">
              {cast.map(member => (
                <div key={member.id} className="flex-none w-20 text-center">
                  {member.profile_path ? (
                    <img
                      src={`https://image.tmdb.org/t/p/w185${member.profile_path}`}
                      alt={member.name}
                      className="w-full aspect-square object-cover rounded-full mb-2"
                    />
                  ) : (
                    <div className="w-full aspect-square rounded-full bg-white/10 mb-2" />
                  )}
                  <p className="text-xs text-text-secondary line-clamp-2">{member.name}</p>
                  {member.character && (
                    <p className="text-xs text-text-muted line-clamp-1">{member.character}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Season / episode list (series only) */}
        {seasons.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-4">Episodes</h2>
            <div className="flex gap-2 overflow-x-auto pb-4">
              {seasons.map(season => (
                <FocusRing
                  key={season.seasonNumber}
                  className={`px-4 py-2 rounded-full text-sm cursor-pointer whitespace-nowrap ${
                    season.seasonNumber === activeSeason?.seasonNumber
                      ? 'bg-accent text-surface font-semibold'
                      : 'bg-white/10 text-text-secondary'
                  }`}
                  onClick={() => setSelectedSeason(season.seasonNumber)}
                  onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })}
                >
                  {`Season ${season.seasonNumber} · ${season.episodes.length} eps`}
                </FocusRing>
              ))}
            </div>

            {activeSeason && (
              <div className="rounded-card border border-white/10 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/10">
                  <span className="text-base font-semibold text-text-primary">
                    Season {activeSeason.seasonNumber}
                  </span>
                  <span className="text-sm text-text-muted">
                    {activeSeasonEpisodes.length} episodes
                  </span>
                </div>

                <div className="divide-y divide-white/5">
                  {activeSeasonEpisodes.map(ep => {
                    const prog = getProgress(ep.id)
                    const pct  = prog && prog.duration > 0 ? prog.position / prog.duration : 0
                    return (
                      <FocusRing
                        key={ep.id}
                        className="flex items-center gap-4 py-3 px-4 cursor-pointer hover:bg-white/5"
                        onClick={() => playEpisode(ep)}
                        onFocus={e => e.currentTarget.scrollIntoView({ block: 'nearest' })}
                      >
                        <span className="text-text-muted text-sm w-8 flex-none tabular-nums">
                          {String(ep.episode).padStart(2, '0')}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-text-primary truncate">
                            {ep.title || `Episode ${ep.episode}`}
                          </p>
                          {pct > 0 && pct < 0.95 && (
                            <div className="mt-1 h-0.5 bg-white/10 rounded-full overflow-hidden w-32">
                              <div
                                className="h-full bg-accent rounded-full"
                                style={{ width: `${pct * 100}%` }}
                              />
                            </div>
                          )}
                        </div>
                        {ep.quality && (
                          <span className="text-xs text-text-muted border border-white/20 rounded px-1.5 py-0.5">
                            {ep.quality}
                          </span>
                        )}
                      </FocusRing>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

function mergeSeasonEpisodes(localEpisodes, tmdbEpisodes) {
  if (!tmdbEpisodes.length) return localEpisodes

  const byEpisode = new Map(tmdbEpisodes.map(ep => [ep.episode_number, ep]))
  return localEpisodes.map(ep => {
    const tmdbEp = byEpisode.get(ep.episode)
    if (!tmdbEp?.name) return ep
    return {
      ...ep,
      title: tmdbEp.name,
    }
  })
}
