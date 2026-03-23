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
 * Enumerate external (removable) storages via tizen.systeminfo.
 * Returns an array of { key, label, rootPath }.
 */
function getExternalStorages() {
  return new Promise((resolve) => {
    if (typeof tizen === 'undefined') {
      // Browser dev — return a mock device for development
      resolve([
        { key: 'removable1', label: 'USB Drive (mock)', rootPath: 'removable1://' },
      ])
      return
    }

    try {
      tizen.systeminfo.getPropertyValueArray(
        'STORAGE',
        (storages) => {
          const external = []

          storages.forEach((info, idx) => {
            // Tizen storage units: type "EXTERNAL" = removable
            if (!info.units) return
            info.units.forEach(unit => {
              if (unit.type !== 'EXTERNAL') return
              const key = `removable${idx + 1}`
              external.push({
                key,
                label: unit.label || key,
                rootPath: `${key}://`,
              })
            })
          })

          resolve(external)
        },
        () => resolve([])
      )
    } catch {
      resolve([])
    }
  })
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
