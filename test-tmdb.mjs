/**
 * Quick TMDB API key test — run with:
 *   node test-tmdb.mjs
 *
 * Reads VITE_TMDB_API_KEY from .env, hits the TMDB search endpoint,
 * and prints the top result so you can confirm the key is valid.
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Parse .env manually (no dotenv dependency needed)
const envPath = resolve(__dirname, '.env')
const envVars = {}
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIdx = trimmed.indexOf('=')
  if (eqIdx === -1) continue
  envVars[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim()
}

const API_KEY = envVars['VITE_TMDB_API_KEY']
const BEARER  = envVars['VITE_TMDB_READ_ACCESS_TOKEN']

if (!API_KEY || API_KEY === 'your_api_key_here') {
  console.error('No VITE_TMDB_API_KEY found in .env — aborting.')
  process.exit(1)
}

const BASE = 'https://api.themoviedb.org/3'

async function test() {
  console.log('Testing v3 api_key auth...')
  const url = `${BASE}/search/movie?api_key=${API_KEY}&query=Inception&language=en-US&page=1`
  const res = await fetch(url)
  if (!res.ok) {
    console.error(`  FAIL — HTTP ${res.status}: ${res.statusText}`)
    return
  }
  const data = await res.json()
  const top = data.results?.[0]
  if (!top) { console.error('  FAIL — no results returned'); return }
  console.log(`  OK — top result: "${top.title}" (${top.release_date?.slice(0,4)}) — TMDB ID: ${top.id}`)

  if (BEARER && BEARER !== 'your_read_access_token_here') {
    console.log('\nTesting v4 Bearer token auth...')
    const res2 = await fetch(`${BASE}/search/movie?query=Inception&language=en-US&page=1`, {
      headers: { Authorization: `Bearer ${BEARER}`, 'Content-Type': 'application/json' }
    })
    if (!res2.ok) {
      console.error(`  FAIL — HTTP ${res2.status}: ${res2.statusText}`)
      return
    }
    const data2 = await res2.json()
    const top2 = data2.results?.[0]
    console.log(`  OK — top result: "${top2.title}" (${top2.release_date?.slice(0,4)}) — TMDB ID: ${top2.id}`)
  } else {
    console.log('\nSkipping Bearer token test — not set in .env')
  }
}

test().catch(err => { console.error('Unexpected error:', err); process.exit(1) })
