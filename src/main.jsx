import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Clarity from '@microsoft/clarity';
import './index.css'
import App from './App.jsx'

if (import.meta.env.PROD) {
  Clarity.init('vex619g7b3');
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
