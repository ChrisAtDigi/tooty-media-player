import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import useNavigation from '../hooks/useNavigation.js'
import { saveProgress } from '../services/metadataCache.js'

const IS_TIZEN = typeof tizen !== 'undefined'

const UI_TIMEOUT       = 3500   // ms before overlay fades out
const PROGRESS_INTERVAL = 10000  // ms between progress saves

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Convert a Tizen virtual path (e.g. "removable1://Movies/film.mkv")
 * to a URI that AVPlay can open (e.g. "file:///opt/storage/sdcard/Movies/film.mkv").
 * Falls through to the original path on any error.
 */
function resolveFileUri(tizenPath) {
  return new Promise((resolve) => {
    if (typeof tizen === 'undefined') { resolve(tizenPath); return }
    try {
      tizen.filesystem.resolve(
        tizenPath,
        (file) => resolve(file.toURI()),
        ()     => resolve(tizenPath),
        'r',
      )
    } catch {
      resolve(tizenPath)
    }
  })
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function PlayerScreen() {
  const { id }    = useParams()
  const { state } = useLocation()
  const navigate  = useNavigate()

  const videoRef       = useRef(null)
  const uiTimerRef     = useRef(null)
  const progressTimer  = useRef(null)
  const currentTimeRef = useRef(0)
  const durationRef    = useRef(0)

  // Route state supplied by the screen that navigated here
  const title         = state?.title          ?? id
  const filePath      = state?.filePath       ?? null
  const mediaId       = state?.mediaId        ?? id
  const resumeAt      = state?.resumePosition ?? 0

  const [playing,     setPlaying]     = useState(false)
  const [showUI,      setShowUI]      = useState(true)
  const [currentTime, setCurrentTime] = useState(resumeAt)
  const [duration,    setDuration]    = useState(0)

  // ── UI overlay management ─────────────────────────────────────────────────

  const revealUI = useCallback(() => {
    setShowUI(true)
    clearTimeout(uiTimerRef.current)
    uiTimerRef.current = setTimeout(() => setShowUI(false), UI_TIMEOUT)
  }, [])

  // ── Progress saving ───────────────────────────────────────────────────────

  function startProgressSaving() {
    clearInterval(progressTimer.current)
    progressTimer.current = setInterval(() => {
      if (currentTimeRef.current > 0 && durationRef.current > 0) {
        saveProgress(mediaId, currentTimeRef.current, durationRef.current)
      }
    }, PROGRESS_INTERVAL)
  }

  function stopProgressSaving() {
    clearInterval(progressTimer.current)
    // Flush final position immediately
    if (currentTimeRef.current > 0 && durationRef.current > 0) {
      saveProgress(mediaId, currentTimeRef.current, durationRef.current)
    }
  }

  // ── Playback helpers ──────────────────────────────────────────────────────

  function tizenPlay()   { try { webapis.avplay.play();  setPlaying(true)  } catch (_) {} }
  function tizenPause()  { try { webapis.avplay.pause(); setPlaying(false) } catch (_) {} }
  function tizenToggle() {
    try {
      const s = webapis.avplay.getState()
      if (s === 'PLAYING') tizenPause(); else tizenPlay()
    } catch (_) {}
  }

  function html5Toggle() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play(); else v.pause()
  }

  function togglePlay() { IS_TIZEN ? tizenToggle() : html5Toggle(); revealUI() }

  function seekBy(seconds) {
    if (IS_TIZEN) {
      try {
        webapis.avplay.seekTo(Math.max(0, (currentTimeRef.current + seconds) * 1000))
      } catch (_) {}
    } else {
      const v = videoRef.current
      if (v) v.currentTime = Math.max(0, Math.min(durationRef.current, v.currentTime + seconds))
    }
    revealUI()
  }

  function exitPlayer() {
    stopProgressSaving()
    clearTimeout(uiTimerRef.current)
    if (IS_TIZEN) { try { webapis.avplay.stop(); webapis.avplay.close() } catch (_) {} }
    navigate(-1)
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  useNavigation({
    BACK:       exitPlayer,
    ENTER:      togglePlay,
    PLAY_PAUSE: togglePlay,
    PLAY:       () => { IS_TIZEN ? tizenPlay()  : videoRef.current?.play();  revealUI() },
    PAUSE:      () => { IS_TIZEN ? tizenPause() : videoRef.current?.pause(); revealUI() },
    FAST_FWD:   () => seekBy(+30),
    REWIND:     () => seekBy(-10),
    UP:         revealUI,
    DOWN:       revealUI,
  })

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  useEffect(() => {
    // Start the initial UI countdown
    revealUI()

    if (IS_TIZEN && filePath) {
      resolveFileUri(filePath).then(uri => {
        try {
          webapis.avplay.open(uri)
          webapis.avplay.setDisplayRect(0, 0, 1920, 1080)
          webapis.avplay.setListener({
            onbufferingstart:    () => {},
            onbufferingcomplete: () => {},
            oncurrentplaytime: (ms) => {
              const secs = ms / 1000
              currentTimeRef.current = secs
              setCurrentTime(secs)
            },
            onstreamcompleted: () => {
              stopProgressSaving()
              navigate(-1)
            },
            onevent: () => {},
            onerror: (err) => console.error('[AVPlay]', err),
          })

          webapis.avplay.prepareAsync(
            () => {
              // Restore resume position if applicable
              if (resumeAt > 0) {
                try { webapis.avplay.seekTo(resumeAt * 1000) } catch (_) {}
              }
              webapis.avplay.play()
              setPlaying(true)
              startProgressSaving()
              try {
                const dur = webapis.avplay.getDuration() / 1000
                durationRef.current = dur
                setDuration(dur)
              } catch (_) {}
            },
            (err) => console.error('[AVPlay] prepareAsync error', err),
          )
        } catch (e) {
          console.error('[AVPlay] setup error', e)
        }
      })
    } else if (!IS_TIZEN && filePath) {
      // Browser dev: assign src directly
      const v = videoRef.current
      if (v) {
        v.src = filePath
        if (resumeAt > 0) {
          v.addEventListener('loadedmetadata', () => { v.currentTime = resumeAt }, { once: true })
        }
      }
    }

    return () => {
      stopProgressSaving()
      clearTimeout(uiTimerRef.current)
      if (IS_TIZEN) { try { webapis.avplay.stop(); webapis.avplay.close() } catch (_) {} }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived state ─────────────────────────────────────────────────────────

  const progress = duration > 0 ? currentTime / duration : 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-full bg-black" onClick={revealUI}>

      {/* HTML5 video — browser dev mode only */}
      {!IS_TIZEN && (
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          onPlay={() => { setPlaying(true); startProgressSaving() }}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => {
            currentTimeRef.current = e.target.currentTime
            setCurrentTime(e.target.currentTime)
          }}
          onLoadedMetadata={(e) => {
            durationRef.current = e.target.duration
            setDuration(e.target.duration)
          }}
          onEnded={() => { stopProgressSaving(); navigate(-1) }}
        />
      )}

      {/* AVPlay object element — Tizen only */}
      {IS_TIZEN && (
        <object
          id="av-player"
          type="application/avplayer"
          className="absolute inset-0 w-full h-full"
        />
      )}

      {/* ── Overlay UI ── fades out after UI_TIMEOUT ms of inactivity ── */}
      <div
        className={`absolute inset-0 flex flex-col justify-between pointer-events-none
          transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Top bar */}
        <div className="bg-gradient-to-b from-black/75 to-transparent px-safe pt-10 pb-20">
          <p className="text-xl font-semibold text-text-primary">{title}</p>
          {!IS_TIZEN && (
            <p className="text-sm text-text-secondary mt-1">
              Browser dev mode — HTML5 &lt;video&gt; · AVPlay active on Tizen
            </p>
          )}
        </div>

        {/* Bottom controls */}
        <div className="bg-gradient-to-t from-black/75 to-transparent px-safe pb-10 pt-20">
          <div className="w-full h-1 bg-white/20 rounded-full mb-4 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-[width] duration-500"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="flex items-center gap-6 text-sm text-text-secondary">
            <span className="font-mono">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
            <span>{playing ? '▶ Playing' : '⏸ Paused'}</span>
            <span className="ml-auto text-text-muted text-xs">
              ← → ±30s · Enter play/pause · Back to exit
            </span>
          </div>
        </div>
      </div>

    </div>
  )
}
