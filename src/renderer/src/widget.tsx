import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WidgetApp } from './widget/WidgetApp'
import './styles/base.css'
import './styles/widget.css'

const widgetId = new URLSearchParams(window.location.search).get('id') ?? ''

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WidgetApp widgetId={widgetId} />
  </StrictMode>
)
