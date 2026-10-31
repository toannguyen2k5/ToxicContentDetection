import { useEffect, useState } from 'react'
import { checkApiHealth } from './api/client'
import LogViewer     from './components/LogViewer'
import ModelTester   from './components/ModelTester'
import ModelStats    from './components/ModelStats'
import Charts        from './components/Charts'
import Settings      from './components/Settings'
import ExtensionLogs from './components/ExtensionLogs'

type Page = 'logs' | 'extension' | 'tester' | 'stats' | 'charts' | 'settings'

const NAV_ITEMS: { id: Page; icon: string; label: string; sprint: string | null }[] = [
  { id: 'logs',      icon: '📋', label: 'Log Viewer',     sprint: null },
  { id: 'extension', icon: '📡', label: 'Extension Logs', sprint: null },
  { id: 'tester',    icon: '🧪', label: 'Model Tester',   sprint: null },
  { id: 'stats',     icon: '📊', label: 'Model Stats',    sprint: 'S6' },
  { id: 'charts',    icon: '📈', label: 'Charts',         sprint: 'S6' },
  { id: 'settings',  icon: '⚙️', label: 'Settings',       sprint: 'S7' },
]

export default function App() {
  const [page, setPage] = useState<Page>('logs')
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'offline'>('checking')

  // [A] Kiểm tra health API mỗi 15 giây → hiển thị trạng thái ở sidebar
  useEffect(() => {
    let active = true
    const check = async () => {
      try {
        const healthy = await checkApiHealth()
        if (active) setApiStatus(healthy ? 'connected' : 'offline')
      } catch {
        if (active) setApiStatus('offline')
      }
    }
    void check()
    const interval = window.setInterval(check, 15_000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [])

  const renderPage = () => {
    switch (page) {
      case 'logs':      return <LogViewer />
      case 'extension': return <ExtensionLogs />
      case 'tester':    return <ModelTester />
      case 'stats':     return <ModelStats />
      case 'charts':    return <Charts />
      case 'settings':  return <Settings />
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
              className={['nav-item', page === item.id ? 'active' : ''].join(' ')}
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
          <div>PBL6 · Nhóm phát triển</div>
          <div className="status-bar" style={{ marginTop: 6 }}>
            <span
              className="dot"
              style={{
                background: apiStatus === 'connected'
                  ? 'var(--success)'
                  : apiStatus === 'offline'
                    ? 'var(--danger)'
                    : 'var(--warning)',
              }}
            />
            <span>
              {apiStatus === 'connected'
                ? 'API localhost:8000'
                : apiStatus === 'offline'
                  ? 'API không khả dụng'
                  : 'Đang kết nối API...'}
            </span>
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
