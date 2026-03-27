import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import useNavigation from '../hooks/useNavigation.js'
import { useLibrary } from '../context/LibraryContext.jsx'
import { saveProgress } from '../services/metadataCache.js'

const IS_TIZEN = typeof tizen !== 'undefined'

const UI_TIMEOUT = 3500
const PROGRESS_INTERVAL = 10000

// Accelerating skip: tiers based on how long the key has been held
const SEEK_TIERS = [
  { after: 0,    seconds: 10 },
  { after: 2000, seconds: 30 },
  { after: 4000, seconds: 60 },
]

function getSeekTierSeconds(holdStartMs) {
  const elapsed = Date.now() - holdStartMs
  let seconds = SEEK_TIERS[0].seconds
  for (const tier of SEEK_TIERS) {
    if (elapsed >= tier.after) seconds = tier.seconds
  }
  return seconds
}

function formatTime(seconds) {
  if (!seconds || Number.isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function resolveFileUri(tizenPath) {
  return new Promise((resolve) => {
    if (typeof tizen === 'undefined') {
      resolve(tizenPath)
      return
    }

    try {
      tizen.filesystem.resolve(
        tizenPath,
        (file) => resolve(file.toURI()),
        () => resolve(tizenPath),
        'r',
      )
    } catch {
      resolve(tizenPath)
    }
  })
}

export default function PlayerScreen() {
  const { id } = useParams()
  const { state } = useLocation()
  const navigate = useNavigate()
  const { library } = useLibrary()

  const videoRef = useRef(null)
  const uiTimerRef = useRef(null)
  const progressTimer = useRef(null)
  const currentTimeRef = useRef(0)
  const durationRef = useRef(0)
  const seekHoldStartRef = useRef(null)

  const title = state?.title ?? id
  const filePath = state?.filePath ?? null
  const mediaId = state?.mediaId ?? id
  const resumeAt = state?.resumePosition ?? 0
  const subtitles = state?.subtitles ?? []

  const [playing, setPlaying] = useState(false)
  const [showUI, setShowUI] = useState(true)
  const [currentTime, setCurrentTime] = useState(resumeAt)
  const [duration, setDuration] = useState(0)
  const [transportFocus, setTransportFocus] = useState(null)
  const [subsOn, setSubsOn] = useState(false)

  const hasSubtitles = subtitles.length > 0

  const nextEpisode = useMemo(
    () => findNextEpisode(library.series, mediaId),
    [library.series, mediaId]
  )

  const controlOrder = useMemo(
    () => [
      'scrubber',
      'playPause',
      ...(nextEpisode ? ['nextEpisode'] : []),
      ...(hasSubtitles ? ['subtitles'] : []),
    ],
    [nextEpisode, hasSubtitles]
  )

  const revealUI = useCallback(() => {
    setShowUI(true)
    clearTimeout(uiTimerRef.current)
    uiTimerRef.current = setTimeout(() => {
      setShowUI(false)
      setTransportFocus(null)
    }, UI_TIMEOUT)
  }, [])

  const stopProgressSaving = useCallback(() => {
    clearInterval(progressTimer.current)
    if (currentTimeRef.current > 0 && durationRef.current > 0) {
      saveProgress(mediaId, currentTimeRef.current, durationRef.current)
    }
  }, [mediaId])

  const startProgressSaving = useCallback(() => {
    clearInterval(progressTimer.current)
    progressTimer.current = setInterval(() => {
      if (currentTimeRef.current > 0 && durationRef.current > 0) {
        saveProgress(mediaId, currentTimeRef.current, durationRef.current)
      }
    }, PROGRESS_INTERVAL)
  }, [mediaId])

  const openNextEpisode = useCallback(() => {
    if (!nextEpisode) return false

    stopProgressSaving()
    clearTimeout(uiTimerRef.current)

    if (IS_TIZEN) {
      try {
        webapis.avplay.stop()
        webapis.avplay.close()
      } catch (_) {}
    }

    navigate(`/player/${nextEpisode.id}`, {
      replace: true,
      state: {
        title: nextEpisode.playerTitle,
        filePath: nextEpisode.filePath,
        mediaId: nextEpisode.id,
        type: 'episode',
        resumePosition: 0,
      },
    })

    return true
  }, [navigate, nextEpisode, stopProgressSaving])

  function toggleSubtitles() {
    if (!IS_TIZEN || !hasSubtitles) return
    try {
      const next = !subsOn
      webapis.avplay.setSilentSubtitle(!next)
      setSubsOn(next)
    } catch (_) {}
    revealUI()
  }

  function tizenPlay() {
    try {
      webapis.avplay.play()
      setPlaying(true)
    } catch (_) {}
  }

  function tizenPause() {
    try {
      webapis.avplay.pause()
      setPlaying(false)
    } catch (_) {}
  }

  function tizenToggle() {
    try {
      const state = webapis.avplay.getState()
      if (state === 'PLAYING') tizenPause()
      else tizenPlay()
    } catch (_) {}
  }

  function html5Toggle() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) video.play()
    else video.pause()
  }

  function togglePlay() {
    if (IS_TIZEN) tizenToggle()
    else html5Toggle()
    revealUI()
  }

  function seekBy(seconds) {
    if (IS_TIZEN) {
      try {
        const target = Math.max(0, Math.min(durationRef.current, currentTimeRef.current + seconds))
        webapis.avplay.seekTo(target * 1000)
      } catch (_) {}
    } else {
      const video = videoRef.current
      if (video) {
        video.currentTime = Math.max(0, Math.min(durationRef.current, video.currentTime + seconds))
      }
    }
    revealUI()
  }

  function seekWithAcceleration(e, direction) {
    if (!e.repeat) {
      // Fresh press — reset hold timer
      seekHoldStartRef.current = Date.now()
    }
    const amount = getSeekTierSeconds(seekHoldStartRef.current ?? Date.now())
    seekBy(direction * amount)
  }

  function exitPlayer() {
    stopProgressSaving()
    clearTimeout(uiTimerRef.current)
    if (IS_TIZEN) {
      try {
        webapis.avplay.stop()
        webapis.avplay.close()
      } catch (_) {}
    }
    navigate(-1)
  }

  function moveFocus(direction) {
    if (controlOrder.length === 0) return

    if (transportFocus === null) {
      setTransportFocus(controlOrder[0])
      return
    }

    const currentIndex = controlOrder.indexOf(transportFocus)
    const nextIndex = currentIndex + direction

    if (nextIndex < 0) {
      setTransportFocus(null)
      return
    }

    if (nextIndex >= controlOrder.length) return
    setTransportFocus(controlOrder[nextIndex])
  }

  function handleEnter() {
    if (transportFocus === 'nextEpisode') {
      openNextEpisode()
      return
    }
    if (transportFocus === 'subtitles') {
      toggleSubtitles()
      return
    }
    if (transportFocus === 'playPause' || transportFocus === null) {
      togglePlay()
      return
    }
    if (transportFocus === 'scrubber') {
      revealUI()
    }
  }

  function handleLeft(e) {
    if (transportFocus === 'nextEpisode') {
      setTransportFocus('playPause')
      revealUI()
      return
    }

    seekWithAcceleration(e, -1)
  }

  function handleRight(e) {
    if (transportFocus === 'playPause' && nextEpisode) {
      setTransportFocus('nextEpisode')
      revealUI()
      return
    }

    seekWithAcceleration(e, +1)
  }

  useNavigation({
    BACK: exitPlayer,
    ENTER: handleEnter,
    LEFT: handleLeft,
    RIGHT: handleRight,
    PLAY_PAUSE: togglePlay,
    PLAY: () => {
      if (IS_TIZEN) tizenPlay()
      else videoRef.current?.play()
      revealUI()
    },
    PAUSE: () => {
      if (IS_TIZEN) tizenPause()
      else videoRef.current?.pause()
      revealUI()
    },
    FAST_FWD: () => seekBy(+SEEK_SECONDS),
    REWIND: () => seekBy(-SEEK_SECONDS),
    BLUE: openNextEpisode,
    UP: () => {
      revealUI()
      moveFocus(-1)
    },
    DOWN: () => {
      revealUI()
      moveFocus(+1)
    },
  })

  useEffect(() => {
    revealUI()

    if (IS_TIZEN && filePath) {
      resolveFileUri(filePath).then(async uri => {
        try {
          webapis.avplay.open(uri)
          webapis.avplay.setDisplayRect(0, 0, 1920, 1080)
          webapis.avplay.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX')

          // Load the first available subtitle file (start silent; user toggles CC on)
          if (subtitles.length > 0) {
            try {
              const subUri = await resolveFileUri(subtitles[0].path)
              webapis.avplay.setSubtitlePath(subUri)
              webapis.avplay.setSilentSubtitle(true)
            } catch (_) {}
          }

          webapis.avplay.setListener({
            onbufferingstart: () => {},
            onbufferingcomplete: () => {},
            onseekdone: () => {},
            oncurrentplaytime: (ms) => {
              const seconds = ms / 1000
              currentTimeRef.current = seconds
              setCurrentTime(seconds)
            },
            onstreamcompleted: () => {
              stopProgressSaving()
              if (!openNextEpisode()) navigate(-1)
            },
            onevent: () => {},
            onerror: (err) => console.error('[AVPlay]', err),
          })

          webapis.avplay.prepareAsync(
            () => {
              try {
                const nextDuration = webapis.avplay.getDuration() / 1000
                durationRef.current = nextDuration
                setDuration(nextDuration)
              } catch (_) {}

              // play() first (from READY state), then seek while playing —
              // calling seekTo() before play() races against the async seek
              // and play() gets dropped on Samsung AVPlay
              webapis.avplay.play()
              setPlaying(true)
              startProgressSaving()

              if (resumeAt > 0) {
                try { webapis.avplay.seekTo(resumeAt * 1000) } catch (_) {}
              }
            },
            (err) => console.error('[AVPlay] prepareAsync error', err),
          )
        } catch (error) {
          console.error('[AVPlay] setup error', error)
        }
      })
    } else if (!IS_TIZEN && filePath) {
      const video = videoRef.current
      if (video) {
        video.src = filePath
        if (resumeAt > 0) {
          video.addEventListener('loadedmetadata', () => {
            video.currentTime = resumeAt
          }, { once: true })
        }
      }
    }

    return () => {
      stopProgressSaving()
      clearTimeout(uiTimerRef.current)
      if (IS_TIZEN) {
        try {
          webapis.avplay.stop()
          webapis.avplay.close()
        } catch (_) {}
      }
    }
  }, [filePath, navigate, openNextEpisode, resumeAt, revealUI, startProgressSaving, stopProgressSaving])

  const progress = duration > 0 ? currentTime / duration : 0

  return (
    <div className="relative w-full h-full bg-black" onClick={revealUI}>
      {!IS_TIZEN && (
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          onPlay={() => {
            setPlaying(true)
            startProgressSaving()
          }}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(event) => {
            currentTimeRef.current = event.target.currentTime
            setCurrentTime(event.target.currentTime)
          }}
          onLoadedMetadata={(event) => {
            durationRef.current = event.target.duration
            setDuration(event.target.duration)
          }}
          onEnded={() => {
            stopProgressSaving()
            if (!openNextEpisode()) navigate(-1)
          }}
        />
      )}

      {IS_TIZEN && (
        <object
          id="av-player"
          type="application/avplayer"
          className="absolute inset-0 w-full h-full"
        />
      )}

      <div
        className={`absolute inset-0 flex flex-col justify-between pointer-events-none transition-opacity duration-300 ${
          showUI ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="bg-gradient-to-b from-black/75 to-transparent px-safe pt-10 pb-20">
          <p className="text-2xl font-semibold text-text-primary">{title}</p>
          {!IS_TIZEN && (
            <p className="text-sm text-text-secondary mt-1">
              Browser dev mode - HTML5 video, AVPlay on Tizen
            </p>
          )}
        </div>

        <div className="bg-gradient-to-t from-black/75 to-transparent px-safe pb-12 pt-24">
          <div className={`rounded-card border px-4 py-3 transition-colors ${
            transportFocus === 'scrubber'
              ? 'border-accent bg-accent/10'
              : 'border-white/15 bg-white/5'
          }`}>
            <div className="w-full h-3 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-[width] duration-500"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <div className="mt-3 flex items-center justify-between text-sm text-text-secondary">
              <span className="font-mono text-lg">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
              <span>{transportFocus === 'scrubber' ? 'Left/Right to seek ±10s' : 'Playback progress'}</span>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-4 text-base text-text-secondary">
            <button
              type="button"
              className={`pointer-events-auto rounded-full border px-5 py-2 text-sm ${
                transportFocus === 'playPause'
                  ? 'border-accent bg-accent text-surface'
                  : 'border-white/20 bg-white/10 text-text-primary'
              }`}
              onClick={togglePlay}
            >
              {playing ? 'Pause' : 'Play'}
            </button>

            {nextEpisode && (
              <button
                type="button"
                className={`pointer-events-auto rounded-full border px-5 py-2 text-sm ${
                  transportFocus === 'nextEpisode'
                    ? 'border-accent bg-accent text-surface'
                    : 'border-white/20 bg-white/10 text-text-primary'
                }`}
                onClick={openNextEpisode}
              >
                Next Episode
              </button>
            )}

            {hasSubtitles && (
              <button
                type="button"
                className={`pointer-events-auto rounded-full border px-5 py-2 text-sm ${
                  transportFocus === 'subtitles'
                    ? 'border-accent bg-accent text-surface'
                    : subsOn
                      ? 'border-accent/60 bg-accent/20 text-accent'
                      : 'border-white/20 bg-white/10 text-text-secondary'
                }`}
                onClick={toggleSubtitles}
              >
                CC {subsOn ? 'On' : 'Off'}
              </button>
            )}

            <span className="ml-auto text-text-muted text-sm">
              Down opens controls · Left/Right seek ±10s · Enter activates selected control · Blue next episode
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function findNextEpisode(seriesList, mediaId) {
  for (const show of seriesList) {
    const seasons = [...(show.seasons ?? [])].sort((a, b) => a.seasonNumber - b.seasonNumber)

    for (let seasonIndex = 0; seasonIndex < seasons.length; seasonIndex++) {
      const season = seasons[seasonIndex]
      const episodes = [...(season.episodes ?? [])].sort((a, b) => a.episode - b.episode)
      const episodeIndex = episodes.findIndex(episode => episode.id === mediaId)
      if (episodeIndex === -1) continue

      const directNext = episodes[episodeIndex + 1]
      if (directNext) return decorateEpisode(show, directNext)

      for (let nextSeasonIndex = seasonIndex + 1; nextSeasonIndex < seasons.length; nextSeasonIndex++) {
        const nextSeason = seasons[nextSeasonIndex]
        const firstEpisode = [...(nextSeason.episodes ?? [])].sort((a, b) => a.episode - b.episode)[0]
        if (firstEpisode) return decorateEpisode(show, firstEpisode)
      }

      return null
    }
  }

  return null
}

function decorateEpisode(show, episode) {
  return {
    ...episode,
    playerTitle: [
      show.title,
      `S${String(episode.season).padStart(2, '0')}E${String(episode.episode).padStart(2, '0')}`,
      episode.title,
    ].filter(Boolean).join(' · '),
  }
}
