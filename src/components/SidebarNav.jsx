import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import FocusRing from './FocusRing.jsx'
import tootyLogo from '../assets/images/tooty-logo-transparent.png'

const NAV_ITEMS = [
  { label: 'Home',     path: '/',                  icon: HomeIcon },
  { label: 'Search',   path: '/search',            icon: SearchIcon },
  { label: 'Movies',   path: '/browse/movies',     icon: MoviesIcon },
  { label: 'Series',   path: '/browse/series',     icon: SeriesIcon },
  { label: 'Books',    path: '/browse/audiobooks', icon: BooksIcon },
  { label: 'Music',    path: '/browse/music',      icon: MusicIcon },
  { label: 'Settings', path: '/settings',          icon: SettingsIcon },
]

export default function SidebarNav() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <aside className="w-32 flex-none h-full bg-surface-raised border-r border-white/10 px-4 py-8">
      <div className="h-full flex flex-col items-center">
        <img src={tootyLogo} alt="Tooty" className="w-24 h-24 object-contain mb-8" />
        <nav className="w-full flex flex-col gap-4">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon
            const active = location.pathname === item.path
            return (
              <FocusRing
                key={item.path}
                className={`w-full rounded-card px-2 py-4 cursor-pointer ${
                  active ? 'bg-white/10 text-text-primary' : 'text-text-secondary'
                }`}
                onClick={() => navigate(item.path)}
              >
                <div className="flex flex-col items-center text-center gap-2">
                  <Icon active={active} />
                  <span className={`text-xs font-semibold ${active ? 'text-text-primary' : ''}`}>
                    {item.label}
                  </span>
                </div>
              </FocusRing>
            )
          })}
        </nav>
      </div>
    </aside>
  )
}

function IconFrame({ active = false, children }) {
  return (
    <div
      className={`w-11 h-11 rounded-2xl border flex items-center justify-center ${
        active
          ? 'border-accent bg-accent/15 text-accent'
          : 'border-white/10 bg-white/5 text-text-secondary'
      }`}
    >
      {children}
    </div>
  )
}

function HomeIcon({ active }) {
  return (
    <IconFrame active={active}>
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
        <path d="M4 10.5 12 4l8 6.5" />
        <path d="M6.5 9.5V20h11V9.5" />
      </svg>
    </IconFrame>
  )
}

function SearchIcon({ active }) {
  return (
    <IconFrame active={active}>
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
        <circle cx="11" cy="11" r="7" />
        <path d="M16.5 16.5 21 21" strokeLinecap="round" />
      </svg>
    </IconFrame>
  )
}

function MoviesIcon({ active }) {
  return (
    <IconFrame active={active}>
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M8 5v14M16 5v14M4 9h16M4 15h16" />
      </svg>
    </IconFrame>
  )
}

function SeriesIcon({ active }) {
  return (
    <IconFrame active={active}>
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
        <rect x="3.5" y="5" width="17" height="12" rx="2" />
        <path d="M8 19h8M12 17v2" />
      </svg>
    </IconFrame>
  )
}

function BooksIcon({ active }) {
  return (
    <IconFrame active={active}>
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
        <path d="M6 5.5h9a3 3 0 0 1 3 3V19H9a3 3 0 0 0-3 3Z" />
        <path d="M6 5.5v16.5" />
      </svg>
    </IconFrame>
  )
}

function MusicIcon({ active }) {
  return (
    <IconFrame active={active}>
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
        <path d="M14 5v9.5a2.5 2.5 0 1 1-2-2.45V7l8-2v7.5a2.5 2.5 0 1 1-2-2.45V3.5Z" />
      </svg>
    </IconFrame>
  )
}

function SettingsIcon({ active }) {
  return (
    <IconFrame active={active}>
      <svg viewBox="0 0 24 24" className="w-5 h-5 fill-none stroke-current stroke-2">
        <path d="M12 8.5a3.5 3.5 0 1 0 0 7a3.5 3.5 0 0 0 0-7Z" />
        <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1 0 2.8l-.6.6a2 2 0 0 1-2.8 0l-.1-.1a1 1 0 0 0-1.1-.2a1 1 0 0 0-.6.9V20a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-.2a1 1 0 0 0-.6-.9a1 1 0 0 0-1.1.2l-.1.1a2 2 0 0 1-2.8 0l-.6-.6a2 2 0 0 1 0-2.8l.1-.1a1 1 0 0 0 .2-1.1a1 1 0 0 0-.9-.6H4a2 2 0 0 1-2-2v-1a2 2 0 0 1 2-2h.2a1 1 0 0 0 .9-.6a1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 0 1 0-2.8l.6-.6a2 2 0 0 1 2.8 0l.1.1a1 1 0 0 0 1.1.2a1 1 0 0 0 .6-.9V4a2 2 0 0 1 2-2h1a2 2 0 0 1 2 2v.2a1 1 0 0 0 .6.9a1 1 0 0 0 1.1-.2l.1-.1a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8l-.1.1a1 1 0 0 0-.2 1.1a1 1 0 0 0 .9.6h.2a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2h-.2a1 1 0 0 0-.9.6Z" />
      </svg>
    </IconFrame>
  )
}
