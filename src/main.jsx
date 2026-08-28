import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Clarity from '@microsoft/clarity';
import './index.css'
import App from './App.jsx'
import RulesPage from './app/rules/RulesPage.jsx'
import StampsNewPage from './app/stamps/new/StampsNewPage.jsx'
import CanonPage from './app/meals/canon/CanonPage.jsx'
import WeeksPage from './app/meals/weeks/WeeksPage.jsx'
import WeekDetailPage from './app/meals/weeks/WeekDetailPage.jsx'

// Clarity is landing-only. Do not init on /app/* or /stamps/new.
if (import.meta.env.PROD && location.pathname === '/') {
  Clarity.init('vex619g7b3');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/app/rules" element={<RulesPage />} />
        <Route path="/app/stamps/new" element={<StampsNewPage />} />
        <Route path="/stamps/new" element={<StampsNewPage />} />
        <Route path="/app/meals/canon" element={<CanonPage />} />
        <Route path="/app/meals/weeks" element={<WeeksPage />} />
        <Route path="/app/meals/weeks/:id" element={<WeekDetailPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
