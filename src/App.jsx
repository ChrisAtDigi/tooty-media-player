import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { LibraryProvider } from './context/LibraryContext.jsx'
import HomeScreen     from './screens/HomeScreen.jsx'
import BrowseScreen   from './screens/BrowseScreen.jsx'
import DetailScreen   from './screens/DetailScreen.jsx'
import PlayerScreen   from './screens/PlayerScreen.jsx'
import SearchScreen   from './screens/SearchScreen.jsx'
import SettingsScreen from './screens/SettingsScreen.jsx'

export default function App() {
  return (
    <LibraryProvider>
      <Routes>
        <Route path="/"                  element={<HomeScreen />}     />
        <Route path="/browse/:category"  element={<BrowseScreen />}   />
        <Route path="/detail/:id"        element={<DetailScreen />}   />
        <Route path="/player/:id"        element={<PlayerScreen />}   />
        <Route path="/search"            element={<SearchScreen />}   />
        <Route path="/settings"          element={<SettingsScreen />} />
      </Routes>
    </LibraryProvider>
  )
}
