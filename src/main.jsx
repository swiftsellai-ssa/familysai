import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Clarity from '@microsoft/clarity';
import './index.css'
import App from './App.jsx'
import RulesPage from './app/rules/RulesPage.jsx'

// Clarity is landing-only. Do not init on /app/rules (or any /app/*).
if (import.meta.env.PROD && location.pathname === '/') {
  Clarity.init('vex619g7b3');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/app/rules" element={<RulesPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
