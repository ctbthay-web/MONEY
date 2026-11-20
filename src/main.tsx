import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './theme-accents.css'
import './index.css'
import App from './App.tsx'
import { applyTheme, loadTheme } from './lib/theme'
import { installErrorTracking } from './lib/track'

applyTheme(loadTheme())
installErrorTracking()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
