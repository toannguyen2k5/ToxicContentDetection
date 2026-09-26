/**
 * [Owner: C] — Task C-17
 * LogViewer: bảng hiển thị log comment đã quét.
 * Fix B: silent auto-refresh (không reset loading).
 * Fix C: click row → modal chi tiết comment đầy đủ.
 */
import { useState, useEffect, useCallback } from 'react'
import { fetchLogs, LogEntry } from '../api/client'

const PAGE_SIZE = 10

function formatTime(ts: string): string {
  return new Date(ts).toLocaleString('vi-VN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    day: '2-digit', month: '2-digit',
  })
}

function formatProb(p: number): string {
  return p > 0 ? `${(p * 100).toFixed(0)}%` : '—'
}

// ─── Modal chi tiết ───────────────────────────────────────────────────────
function LogDetailModal({ log, onClose }: { log: LogEntry; onClose: () => void }) {
  // Đóng modal khi bấm Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Chi tiết bình luận #{log.id}</h3>
          <button className="modal-close" onClick={onClose} id="modal-close-btn">✕</button>
        </div>
        <div className="modal-body">
          {/* Label + meta */}
          <div className="modal-meta">
            <span className={`badge badge-${log.label}`}>{log.label}</span>
            <span className="meta-chip">Tier {log.tier_used}</span>
            <span className="meta-chip">{log.latency_ms}ms</span>
          </div>

          {/* Nội dung đầy đủ */}
          <div className="modal-full-text">{log.text}</div>

          {/* Chi tiết kỹ thuật */}
          <div className="modal-details">
            <div className="detail-item">
              <span className="detail-label">Prob Tier 1</span>
              <span className="detail-value">{formatProb(log.prob_t1)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Prob Tier 2</span>
              <span className="detail-value">{formatProb(log.prob_t2)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Tier xử lý</span>
              <span className="detail-value">T{log.tier_used}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Thời gian</span>
              <span className="detail-value">{formatTime(log.timestamp)}</span>
            </div>
          </div>

          {/* URL nguồn */}
          <div className="modal-url">
            🔗 <a href={log.source_url} target="_blank" rel="noreferrer">{log.source_url}</a>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── LogViewer chính ─────────────────────────────────────────────────────
export default function LogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)      // chỉ true lần đầu
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)

  // Fix B: tham số silent — auto-refresh không set loading=true → tránh màn trắng
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const data = await fetchLogs()
    setLogs(data)
    setLastRefresh(new Date())
    setLoading(false)
  }, [])

  // Load lần đầu (có loading indicator)
  useEffect(() => { load(false) }, [load])

  // Auto-refresh 30s — silent
  useEffect(() => {
    const id = setInterval(() => load(true), 30_000)
    return () => clearInterval(id)
  }, [load])

  const totalPages = Math.ceil(logs.length / PAGE_SIZE)
  const pageData   = logs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const stats = {
    clean:     logs.filter(l => l.label === 'CLEAN').length,
    offensive: logs.filter(l => l.label === 'OFFENSIVE').length,
    hate:      logs.filter(l => l.label === 'HATE').length,
  }

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1>📋 Log Viewer</h1>
        <p>Danh sách comment đã được hệ thống quét và phân loại</p>
        <div className="status-bar">
          <span className="dot" />
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Cập nhật lúc {lastRefresh.toLocaleTimeString('vi-VN')} · Auto-refresh 30s
          </span>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {([
          { key: 'CLEAN',     count: stats.clean,     label: '✅ Clean'     },
          { key: 'OFFENSIVE', count: stats.offensive, label: '⚠️ Offensive' },
          { key: 'HATE',      count: stats.hate,      label: '🚫 Hate'      },
        ] as const).map(s => (
          <div key={s.key} className="card" style={{ padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className={`badge badge-${s.key}`}>{s.label}</span>
            <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{s.count}</span>
          </div>
        ))}
        <div className="card" style={{ padding: '12px 20px', display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>📊 Tổng</span>
          <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>{logs.length}</span>
        </div>
      </div>

      {/* Table card */}
      <div className="card">
        <div className="toolbar">
          <span className="toolbar-info">
            {loading
              ? 'Đang tải...'
              : `${logs.length} kết quả · Trang ${page}/${Math.max(1, totalPages)}`
            }
          </span>
          <button className="btn btn-outline" onClick={() => load(false)} disabled={loading} id="btn-refresh">
            🔄 Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Đang tải dữ liệu...
          </div>
        ) : (
          <>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nội dung bình luận</th>
                    <th>Nhãn</th>
                    <th>Prob T1</th>
                    <th>Prob T2</th>
                    <th>Tier</th>
                    <th>Latency</th>
                    <th>Thời gian</th>
                    <th>Nguồn</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.map(log => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      style={{ cursor: 'pointer' }}
                      title="Click để xem chi tiết"
                    >
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{log.id}</td>
                      <td><div className="col-text">{log.text}</div></td>
                      <td><span className={`badge badge-${log.label}`}>{log.label}</span></td>
                      <td className="col-prob">{formatProb(log.prob_t1)}</td>
                      <td className="col-prob">{formatProb(log.prob_t2)}</td>
                      <td className="col-tier">T{log.tier_used}</td>
                      <td className="col-latency">{log.latency_ms}ms</td>
                      <td className="col-ts">{formatTime(log.timestamp)}</td>
                      <td className="col-url">
                        <a
                          href={log.source_url}
                          target="_blank"
                          rel="noreferrer"
                          title={log.source_url}
                          onClick={e => e.stopPropagation()}
                        >
                          {log.source_url.replace('https://', '')}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="pagination">
              <button className="page-btn" onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1} id="btn-page-prev">‹ Trước</button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} id={`btn-page-${p}`}
                  className={`page-btn ${p === page ? 'active' : ''}`}
                  onClick={() => setPage(p)}>{p}</button>
              ))}
              <button className="page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages} id="btn-page-next">Sau ›</button>
            </div>
          </>
        )}
      </div>

      {/* Fix C: Modal chi tiết */}
      {selectedLog && (
        <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  )
}
