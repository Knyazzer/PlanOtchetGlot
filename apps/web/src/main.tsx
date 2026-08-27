import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts.css'
import './ui-kit/tokens.css'
import './index.css'
import './styles/kit.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)