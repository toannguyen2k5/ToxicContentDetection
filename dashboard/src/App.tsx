import { useState } from 'react'
import LogViewer from './components/LogViewer'
import ModelTester from './components/ModelTester'
import ModelStats from './components/ModelStats'
import Charts from './components/Charts'
import Settings from './components/Settings'

type Page = 'logs' | 'tester' | 'stats' | 'charts' | 'settings'

const NAV_ITEMS: { id: Page; icon: string; label: string; sprint: string | null }[] = [
  { id: 'logs',     icon: '📋', label: 'Log Viewer',    sprint: null },
  { id: 'tester',   icon: '🧪', label: 'Model Tester',  sprint: null },
  { id: 'stats',    icon: '📊', label: 'Model Stats',   sprint: 'S6' },
  { id: 'charts',   icon: '📈', label: 'Charts',        sprint: 'S6' },
  { id: 'settings', icon: '⚙️', label: 'Settings',      sprint: 'S7' },
]

export default function App() {
  const [page, setPage] = useState<Page>('logs')

  const renderPage = () => {
    switch (page) {
      case 'logs':     return <LogViewer />
      case 'tester':   return <ModelTester />
      case 'stats':    return <ModelStats />
      case 'charts':   return <Charts />
      case 'settings': return <Settings />
    }
  }

  return (
    <div className="layout">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h2>🛡️ Toxic Detector</h2>
          <p>Admin Dashboard · PBL6</p>
        </div>

        <nav>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              className={[
                'nav-item',
                page === item.id ? 'active' : '',
              ].join(' ')}
              onClick={() => setPage(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {item.sprint && (
                <span className="nav-tag">{item.sprint}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div>PBL6 — Nhóm phát triển</div>
          <div className="status-bar" style={{ marginTop: 6 }}>
            <span className="dot" />
            <span>API localhost:8000</span>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="main-content">
        {renderPage()}
      </main>
    </div>
  )
}
