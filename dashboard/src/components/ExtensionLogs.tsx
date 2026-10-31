/**
 * [Owner: C] — Task C-19 (làm thay A)
 * ExtensionLogs: tab hiển thị real-time classification từ Chrome extension.
 * Tự động refresh mỗi 5s. Hiển thị log mới nhất lên đầu.
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import {
  fetchLogs,
  fetchStats,
  LogEntry,
  LogPage,
  DashboardStats,
  LogStats,
} from '../api/client'

const REFRESH_MS = 5000   // auto-refresh 5 giây
const PAGE_SIZE  = 15

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatTime(ts: string): string {
  return new Date(ts).toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    day: '2-digit', month: '2-digit',
  })
}

function tierLabel(t: number): string {
  return t === 1 ? 'T1' : t === 2 ? 'T2' : 'T3 🤖'
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return url || '—'
  }
}

// ─── Stat Card ────────────────────────────────────────────────────────────
function StatCard({ value, label, cls }: { value: number; label: string; cls: string }) {
  return (
    <div className={`stat-card stat-${cls}`}>
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────
export default function ExtensionLogs() {
  const [logs,    setLogs]    = useState<LogEntry[]>([])
  const [stats,   setStats]   = useState<LogStats>({ total: 0, clean: 0, offensive: 0, hate: 0 })
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [page,    setPage]    = useState(1)
  const [clearing, setClearing] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const [logPage, rawStats] = await Promise.all([
        fetchLogs(PAGE_SIZE, (page - 1) * PAGE_SIZE),
        fetchStats(),
      ])
      setLogs(logPage.items)
      setTotal(logPage.total)
      setStats({
        total:     rawStats.total,
        clean:     rawStats.labels?.CLEAN     ?? 0,
        offensive: rawStats.labels?.OFFENSIVE ?? 0,
        hate:      rawStats.labels?.HATE      ?? 0,
      })
    } catch (e) {
      setError('Không kết nối được API. Kiểm tra FastAPI đang chạy tại localhost:8000.')
    } finally {
      if (!silent) setLoading(false)
    }
  }, [page])

  // First load
  useEffect(() => {
    load(false)
  }, [load])

  // Auto-refresh
  useEffect(() => {
    intervalRef.current = setInterval(() => load(true), REFRESH_MS)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [load])

  // Pagination
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const handleClear = async () => {
    // Không clear SQLite history — chỉ để placeholder
    alert('Lịch sử được lưu trong SQLite. Liên hệ admin để xóa.')
  }

  // ─── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <h1>📡 Extension Logs</h1>
        <p className="page-subtitle">
          Comment được Chrome Extension phân loại real-time — cập nhật mỗi 5 giây
        </p>
        <div className="header-meta">
          <span className="live-dot" />
          <span>Live · Auto-refresh {REFRESH_MS / 1000}s</span>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <StatCard value={stats.clean}     label="Clean"     cls="clean"     />
        <StatCard value={stats.offensive} label="Offensive" cls="offensive" />
        <StatCard value={stats.hate}      label="Hate"      cls="hate"      />
        <StatCard value={stats.total}     label="Tổng"      cls="total"     />
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <button
          id="ext-refresh-btn"
          className="btn btn-secondary"
          onClick={() => load(false)}
          disabled={loading}
        >
          🔄 Refresh
        </button>
        <button
          id="ext-clear-btn"
          className="btn btn-danger"
          onClick={handleClear}
          disabled={clearing || stats.total === 0}
        >
          🗑 Xóa log
        </button>
        <span className="toolbar-hint">
          {stats.total === 0
            ? 'Chưa có log — hãy mở Facebook/YouTube với extension đang bật'
            : `${stats.total} classifications · Trang ${page}/${totalPages}`}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="alert alert-error">⚠️ {error}</div>
      )}

      {/* Empty state */}
      {!loading && !error && logs.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <h3>Chưa có dữ liệu từ Extension</h3>
          <p>
            Đảm bảo Chrome Extension đang bật và đang mở một trang có bình luận
            (Facebook, YouTube...). Extension sẽ tự động gửi comment về API.
          </p>
        </div>
      )}

      {/* Table */}
      {(loading || logs.length > 0) && (
        <div className="table-card">
          {loading && <div className="table-loading">Đang tải...</div>}
          {!loading && (
            <table className="log-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>NỘI DUNG BÌNH LUẬN</th>
                  <th>NHÃN</th>
                  <th>TIER</th>
                  <th>LATENCY</th>
                  <th>THỜI GIAN</th>
                  <th>NGUỒN</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(entry => (
                  <tr
                    key={entry.id}
                    className={entry.id === lastSeen ? 'row-new' : ''}
                  >
                    <td className="col-id">{entry.id}</td>
                    <td className="col-text">
                      <span title={entry.text}>
                        {entry.text.length > 70
                          ? entry.text.slice(0, 70) + '…'
                          : entry.text}
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-${entry.label}`}>
                        {entry.label}
                      </span>
                    </td>
                    <td className="col-tier">{tierLabel(entry.tier_used)}</td>
                    <td className="col-latency">
                      <span className={entry.latency_ms > 1000 ? 'latency-slow' : ''}>
                        {entry.latency_ms === 0 ? 'cache' : `${entry.latency_ms}ms`}
                      </span>
                    </td>
                    <td className="col-time">{formatTime(entry.timestamp)}</td>
                    <td className="col-url">
                      {entry.source_url ? (
                        <a href={entry.source_url} target="_blank" rel="noreferrer">
                          {domainOf(entry.source_url)}
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            id="ext-prev-btn"
            className="btn btn-ghost"
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >
            ← Trước
          </button>
          <span>{page} / {totalPages}</span>
          <button
            id="ext-next-btn"
            className="btn btn-ghost"
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Sau →
          </button>
        </div>
      )}
    </div>
  )
}
