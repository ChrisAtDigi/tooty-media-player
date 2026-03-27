/**
 * deviceDetector.js
 *
 * Detects connected storage devices and determines whether a rescan is needed.
 *
 * A device is "known" if we have a cached library snapshot for it.
 * A device is "new"  if we've never seen it, or if the user explicitly
 * requests a fresh scan.
 *
 * Device identity is based on the storage label or volume ID reported by
 * tizen.systeminfo. On Tizen, external storage appears as:
 *   - "removable1", "removable2", etc.  (virtual path prefix)
 *
 * The cached snapshot is stored in localStorage under:
 *   "tooty:device:<deviceKey>"  → { label, rootPath, library, scannedAt }
 */

const NS = 'tooty:device'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * DeviceInfo: {
 *   key:      string   — stable identifier (e.g. "removable1")
 *   label:    string   — human-readable label from OS, or key if unavailable
 *   rootPath: string   — Tizen virtual root path (e.g. "removable1://")
 *   isNew:    boolean  — true if no cached library exists for this device
 * }
 */

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detect all currently connected external storage devices.
 * Returns a DeviceInfo[] array (may be empty if no device is connected).
 */
export async function detectDevices() {
  const storages = await getExternalStorages()
  return storages.map(s => buildDeviceInfo(s))
}

/**
 * Check whether a specific device needs a (re)scan.
 * Returns true for new devices or when forceRescan is set.
 *
 * @param {string} deviceKey
 * @param {boolean} [forceRescan=false]
 */
export function needsScan(deviceKey, forceRescan = false) {
  if (forceRescan) return true
  if (typeof tizen === 'undefined') return true
  return !hasCachedLibrary(deviceKey)
}

/**
 * Persist the library result for a device after a successful scan.
 *
 * @param {string} deviceKey
 * @param {string} label
 * @param {string} rootPath
 * @param {object} library  — LibraryResult from scanner.js
 */
export function saveDeviceLibrary(deviceKey, label, rootPath, library) {
  try {
    const record = {
      key: deviceKey,
      label,
      rootPath,
      library,
      scannedAt: Date.now(),
    }
    localStorage.setItem(deviceKey_(deviceKey), JSON.stringify(record))
  } catch (e) {
    // If storage is full, clear old device records and retry
    clearOldDeviceRecords()
    try {
      localStorage.setItem(
        deviceKey_(deviceKey),
        JSON.stringify({ key: deviceKey, label, rootPath, library, scannedAt: Date.now() })
      )
    } catch {
      // Accept the loss silently
    }
  }
}

/**
 * Load the cached library for a device.
 * Returns { label, rootPath, library, scannedAt } or null.
 */
export function loadDeviceLibrary(deviceKey) {
  try {
    const raw = localStorage.getItem(deviceKey_(deviceKey))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * Explicitly invalidate the cached library for a device,
 * forcing a fresh scan on next launch.
 *
 * @param {string} deviceKey
 */
export function invalidateDevice(deviceKey) {
  localStorage.removeItem(deviceKey_(deviceKey))
}

/**
 * Returns true if a cached library exists for this device.
 */
export function hasCachedLibrary(deviceKey) {
  return localStorage.getItem(deviceKey_(deviceKey)) !== null
}

/**
 * List all device keys that have a cached library in localStorage.
 */
export function listKnownDevices() {
  const prefix = `${NS}:`
  const known = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(prefix)) {
      known.push(key.slice(prefix.length))
    }
  }
  return known
}

// ─── Tizen storage enumeration ────────────────────────────────────────────────

/**
 * Enumerate external (removable) storages.
 *
 * Strategy (TV):
 *   1. tizen.filesystem.listStorages()  — the TV-native API; most reliable.
 *   2. tizen.systeminfo.getPropertyValueArray('STORAGE', ...) — mobile-oriented
 *      fallback used when listStorages is unavailable or returns nothing.
 *
 * Returns an array of { key, label, rootPath }.
 */
function getExternalStorages() {
  return new Promise((resolve) => {
    if (typeof tizen === 'undefined') {
      // Browser dev — use VITE_DEV_ROOT if set (e.g. "D:/"), else a generic mock
      const devRoot = import.meta.env.VITE_DEV_ROOT ?? 'D:/'
      const devLabel = `Dev Drive (${devRoot})`
      resolve([{ key: 'dev-drive', label: devLabel, rootPath: devRoot }])
      return
    }

    // ── Primary: filesystem.listStorages (Tizen TV native) ──────────────────
    if (typeof tizen.filesystem?.listStorages === 'function') {
      try {
        tizen.filesystem.listStorages(
          (storages) => {
            console.log('[Tooty] tizen.filesystem.listStorages raw:', JSON.stringify(
              storages.map(s => ({ label: s.label, type: s.type, state: s.state }))
            ))

            const external = storages
              .filter(s => s.type === 'EXTERNAL' && s.state === 'MOUNTED')
              .map(s => ({
                key:      s.label,
                label:    s.label,
                rootPath: s.label,
              }))

            console.log('[Tooty] external storages found:', JSON.stringify(external))

            if (external.length > 0) {
              resolve(external)
              return
            }

            // listStorages returned nothing external — fall through to systeminfo
            getExternalStoragesViaSysteminfo().then(resolve)
          },
          (err) => {
            console.warn('[Tooty] listStorages error:', err)
            getExternalStoragesViaSysteminfo().then(resolve)
          }
        )
        return
      } catch (e) {
        console.warn('[Tooty] listStorages threw:', e)
        // fall through
      }
    }

    // ── Fallback: systeminfo ─────────────────────────────────────────────────
    getExternalStoragesViaSysteminfo().then(resolve)
  })
}

/**
 * Fallback storage enumeration using tizen.systeminfo.
 * Used when filesystem.listStorages is unavailable or finds nothing.
 */
function getExternalStoragesViaSysteminfo() {
  return new Promise((resolve) => {
    if (!tizen.systeminfo?.getPropertyValueArray) {
      resolve([])
      return
    }

    try {
      tizen.systeminfo.getPropertyValueArray(
        'STORAGE',
        (storages) => {
          console.log('[Tooty] systeminfo STORAGE raw:', JSON.stringify(storages))

          const external = []
          let removableIndex = 1

          flattenStorageUnits(storages).forEach(unit => {
            if (!isExternalStorageUnit(unit)) return
            const key = `removable${removableIndex++}`
            external.push({
              key,
              label: unit.label || key,
              rootPath: key,
            })
          })

          console.log('[Tooty] systeminfo external storages:', JSON.stringify(external))
          resolve(external)
        },
        (err) => {
          console.warn('[Tooty] systeminfo STORAGE error:', err)
          resolve([])
        }
      )
    } catch (e) {
      console.warn('[Tooty] systeminfo threw:', e)
      resolve([])
    }
  })
}

function flattenStorageUnits(storages) {
  return storages.flatMap(entry => {
    if (Array.isArray(entry?.units)) return entry.units
    return entry ? [entry] : []
  })
}

function isExternalStorageUnit(unit) {
  if (!unit) return false

  const type = String(unit.type ?? '').toUpperCase()
  // 'EXTERNAL' — standard Tizen; 'MMC' — used by some Samsung TV models for USB
  if (type === 'EXTERNAL' || type === 'MMC') return true
  if (type.startsWith('USB')) return true

  if (typeof unit.isRemovable === 'boolean') return unit.isRemovable
  return false
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDeviceInfo({ key, label, rootPath }) {
  return {
    key,
    label,
    rootPath,
    isNew: !hasCachedLibrary(key),
  }
}

function deviceKey_(key) {
  return `${NS}:${key}`
}

/**
 * Remove all cached device library records (not metadata or progress).
 */
function clearOldDeviceRecords() {
  const prefix = `${NS}:`
  const toRemove = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(prefix)) toRemove.push(key)
  }
  toRemove.forEach(k => localStorage.removeItem(k))
}
