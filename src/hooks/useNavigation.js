import { useEffect, useRef } from 'react'
import SpatialNavigation from 'js-spatial-navigation'

// Full Tizen remote keycode map.
// Arrow keys (37-40) are standard DOM — no registration needed.
// Media keys and colour buttons must be registered with Tizen's input device API
// before they emit keydown events.
export const KEYS = {
  UP:         38,
  DOWN:       40,
  LEFT:       37,
  RIGHT:      39,
  ENTER:      13,
  BACK:       10009,
  PLAY_PAUSE: 10252,
  PLAY:       415,
  PAUSE:      19,
  FAST_FWD:   417,
  REWIND:     412,
  RED:        403,
  GREEN:      404,
  YELLOW:     405,
  BLUE:       406,
}

// Tizen key names passed to tvinputdevice.registerKey().
// Arrow/Enter are registered automatically; only non-standard keys need this.
const TIZEN_KEY_NAMES = [
  'MediaPlayPause',
  'MediaPlay',
  'MediaPause',
  'MediaFastForward',
  'MediaRewind',
  'ColorF0Red',
  'ColorF1Green',
  'ColorF2Yellow',
  'ColorF3Blue',
  'Back',
]

function registerTizenKeys() {
  try {
    if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
      TIZEN_KEY_NAMES.forEach(name => {
        try { tizen.tvinputdevice.registerKey(name) } catch (_) {}
      })
    }
    // Browser dev mode: tizen is undefined — graceful no-op
  } catch (_) {}
}

/**
 * useNavigation — initialises js-spatial-navigation and Tizen key registration
 * for the mounted screen. Call once per screen component.
 *
 * @param {object} handlers
 *   Map of KEYS key name → callback, e.g. { BACK: () => navigate(-1) }
 *   The ref pattern means you can pass an inline object without causing
 *   the effect to re-run — handlers are always called at their latest version.
 *
 * @param {string} [focusSelector='.focusable']
 *   CSS selector for elements that should participate in spatial navigation
 *   on this screen. Defaults to all .focusable elements in the document.
 */
export default function useNavigation(handlers = {}, focusSelector = '.focusable') {
  // Ref so the keydown listener always sees fresh handlers without re-registering
  const handlersRef = useRef(handlers)
  useEffect(() => { handlersRef.current = handlers })

  useEffect(() => {
    registerTizenKeys()

    SpatialNavigation.init()
    SpatialNavigation.add({ selector: focusSelector })
    SpatialNavigation.focus()

    function handleKeyDown(e) {
      // Normalise W3C MediaPlayPause (179) → Tizen PLAY_PAUSE (10252).
      // Samsung Smart Remotes may send either depending on firmware version.
      const keyCode = e.keyCode === 179 ? 10252 : e.keyCode
      const entry = Object.entries(KEYS).find(([, code]) => code === keyCode)
      if (!entry) return
      const [name] = entry
      const handler = handlersRef.current[name]
      if (handler) {
        e.preventDefault()
        handler(e)
        return
      }

      if (name === 'ENTER') {
        const focused = document.querySelector('.sn-focused, .focusable:focus')
        if (focused && typeof focused.click === 'function') {
          e.preventDefault()
          focused.click()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      try { SpatialNavigation.uninit() } catch (_) {}
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // focusSelector intentionally excluded — selector is read once at mount time,
  // same lifecycle as SpatialNavigation.add().
}
