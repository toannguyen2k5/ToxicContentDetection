/**
 * [Owner: C] — Task C-17
 * LogViewer: hiển thị training data từ dataset_full_5_3_2.csv (61k rows).
 * Fix 1: tổng đếm đúng (đọc từ stats.total, không phải page count).
 * Fix 2: thêm cột quoted_text, pass_7_level, pass_7_reason, hate_category.
 * Fix 3: filter label (All / Clean / Offensive / Hate).
 * Fix 4: ẩn cột prob_t1/t2/latency/tier (không có nghĩa với training data).
 * Fix 5: pagination server-side đúng chuẩn.
 */
import { useState, useEffect, useCallback } from 'react'
import { fetchTrainingLogs, type LogEntry, type LogStats } from '../api/client'

const PAGE_SIZE = 100

type LabelFilter = 'all' | 'clean' | 'offensive' | 'hate'

function formatTime(ts: string): string {
  if (!ts) return '—'
  try {
    return new Date(ts).toLocaleString('vi-VN', {
      hour: '2-digit', minute: '2-digit',
      day: '2-digit', month: '2-digit', year: '2-digit',
    })
  } catch {
    return ts.slice(0, 16)
  }
}

function truncate(text: string | null | undefined, len = 80): string {
  if (!text) return '—'
  return text.length > len ? text.slice(0, len) + '…' : text
}

// ─── Modal chi tiết ───────────────────────────────────────────────────────
function LogDetailModal({ log, onClose }: { log: LogEntry; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const labelClass = log.label?.toLowerCase?.() ?? 'clean'

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
        <div className="modal-header">
          <h3>Chi tiết bình luận #{log.id}</h3>
          <button className="modal-close" onClick={onClose} id="modal-close-btn">✕</button>
        </div>
        <div className="modal-body">
          {/* Label */}
          <div className="modal-meta" style={{ marginBottom: 12 }}>
            <span className={`badge badge-${labelClass}`}>{log.label}</span>
            {log.pass_7_level && <span className="meta-chip">{log.pass_7_level}</span>}
            {log.hate_category && <span className="meta-chip" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>{log.hate_category}</span>}
          </div>

          {/* Text chính */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Nội dung bình luận</div>
            <div className="modal-full-text">{log.text}</div>
          </div>

          {/* Quoted text */}
          {log.quoted_text && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Trích dẫn (quoted text)</div>
              <div className="modal-full-text" style={{ background: 'rgba(255,255,255,0.04)', borderLeft: '3px solid var(--text-secondary)' }}>
                {log.quoted_text}
              </div>
            </div>
          )}

          {/* Pass 7 reason */}
          {log.pass_7_reason && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>Lý do gán nhãn (Pass 7)</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
                {log.pass_7_reason}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="modal-details">
            <div className="detail-item">
              <span className="detail-label">Thời gian đăng</span>
              <span className="detail-value">{formatTime(log.timestamp)}</span>
            </div>
            {log.hate_category && (
              <div className="detail-item">
                <span className="detail-label">Danh mục hate</span>
                <span className="detail-value">{log.hate_category}</span>
              </div>
            )}
          </div>

          {/* URL */}
          {log.source_url && (
            <div className="modal-url">
              🔗 <a href={log.source_url} target="_blank" rel="noreferrer">{log.source_url}</a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── LogViewer chính ─────────────────────────────────────────────────────
export default function LogViewer() {
  const [logs, setLogs]             = useState<LogEntry[]>([])
  const [stats, setStats]           = useState<LogStats | null>(null)
  const [page, setPage]             = useState(1)
  const [labelFilter, setLabelFilter] = useState<LabelFilter>('all')
  const [loading, setLoading]       = useState(true)
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)
  const [error, setError]           = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const result = await fetchTrainingLogs(PAGE_SIZE, (page - 1) * PAGE_SIZE, labelFilter)
      setLogs(result.logs)
      setStats(result.stats)
      setLastRefresh(new Date())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu.')
    } finally {
      setLoading(false)
    }
  }, [page, labelFilter])

  // Load lần đầu + khi đổi page/filter
  useEffect(() => { load(false) }, [load])

  // Auto-refresh 30s — silent
  useEffect(() => {
    const id = setInterval(() => load(true), 30_000)
    return () => clearInterval(id)
  }, [load])

  // Reset về trang 1 khi đổi filter
  const handleFilterChange = (f: LabelFilter) => {
    setPage(1)
    setLabelFilter(f)
  }

  const totalCount = stats?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  // Số trang hiển thị tối đa trong pagination
  const visiblePages = () => {
    const delta = 2
    const range: number[] = []
    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) {
      range.push(i)
    }
    return range
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

      {error && <div className="error-box">⚠️ Không tải được dữ liệu API: {error}</div>}

      {/* Summary cards — clickable filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {([
          { key: 'all'       as LabelFilter, label: '📊 Tổng',       count: stats ? (stats.clean + stats.offensive + stats.hate) : 0, cls: '' },
          { key: 'clean'     as LabelFilter, label: '✅ Clean',       count: stats?.clean ?? 0,     cls: 'CLEAN' },
          { key: 'offensive' as LabelFilter, label: '⚠️ Offensive',  count: stats?.offensive ?? 0, cls: 'OFFENSIVE' },
          { key: 'hate'      as LabelFilter, label: '🚫 Hate',        count: stats?.hate ?? 0,      cls: 'HATE' },
        ]).map(s => (
          <div
            key={s.key}
            className="card"
            onClick={() => handleFilterChange(s.key)}
            id={`filter-btn-${s.key}`}
            style={{
              padding: '12px 20px',
              display: 'flex', gap: 10, alignItems: 'center',
              cursor: 'pointer',
              outline: labelFilter === s.key ? '2px solid var(--accent)' : '2px solid transparent',
              transition: 'outline 0.15s',
              userSelect: 'none',
            }}
            title={`Lọc: ${s.label}`}
          >
            {s.cls
              ? <span className={`badge badge-${s.cls}`}>{s.label}</span>
              : <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{s.label}</span>
            }
            <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>
              {loading ? '…' : s.count.toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="card">
        <div className="toolbar">
          <span className="toolbar-info">
            {loading
              ? 'Đang tải...'
              : `${totalCount.toLocaleString()} kết quả · Trang ${page}/${totalPages}`
            }
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* Filter dropdown thay thế nếu cần */}
            <button className="btn btn-outline" onClick={() => load(false)} disabled={loading} id="btn-refresh">
              🔄 Refresh
            </button>
          </div>
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
                    <th>Quoted Text</th>
                    <th>Nhãn</th>
                    <th>Pass 7 Level</th>
                    <th>Pass 7 Reason</th>
                    <th>Hate Category</th>
                    <th>Thời gian</th>
                    <th>Nguồn</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => (
                    <tr
                      key={log.id}
                      onClick={() => setSelectedLog(log)}
                      style={{ cursor: 'pointer' }}
                      title="Click để xem chi tiết"
                    >
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.78rem' }}>{log.id}</td>
                      <td><div className="col-text">{log.text}</div></td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', maxWidth: 160 }}>
                        <div className="col-text" style={{ maxWidth: 160 }}>{truncate(log.quoted_text, 60)}</div>
                      </td>
                      <td>
                        <span className={`badge badge-${(log.label ?? 'clean').toLowerCase()}`}>
                          {log.label}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        {log.pass_7_level ?? '—'}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: 200 }}>
                        <div className="col-text" style={{ maxWidth: 200 }}>{truncate(log.pass_7_reason, 70)}</div>
                      </td>
                      <td style={{ fontSize: '0.78rem' }}>
                        {log.hate_category
                          ? <span style={{ color: '#f87171' }}>{log.hate_category}</span>
                          : <span style={{ color: 'var(--text-secondary)' }}>—</span>
                        }
                      </td>
                      <td className="col-ts">{formatTime(log.timestamp)}</td>
                      <td className="col-url">
                        {log.source_url ? (
                          <a
                            href={log.source_url}
                            target="_blank"
                            rel="noreferrer"
                            title={log.source_url}
                            onClick={e => e.stopPropagation()}
                          >
                            {log.source_url.replace('https://', '').slice(0, 20)}…
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="pagination">
              <button className="page-btn" onClick={() => setPage(1)}
                disabled={page === 1} id="btn-page-first">«</button>
              <button className="page-btn" onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1} id="btn-page-prev">‹ Trước</button>

              {page > 3 && <span style={{ padding: '0 4px', color: 'var(--text-secondary)' }}>…</span>}
              {visiblePages().map(p => (
                <button key={p} id={`btn-page-${p}`}
                  className={`page-btn ${p === page ? 'active' : ''}`}
                  onClick={() => setPage(p)}>{p}</button>
              ))}
              {page < totalPages - 2 && <span style={{ padding: '0 4px', color: 'var(--text-secondary)' }}>…</span>}

              <button className="page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages} id="btn-page-next">Sau ›</button>
              <button className="page-btn" onClick={() => setPage(totalPages)}
                disabled={page === totalPages} id="btn-page-last">»</button>

              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: 8 }}>
                / {totalPages.toLocaleString()} trang
              </span>
            </div>
          </>
        )}
      </div>

      {/* Modal chi tiết */}
      {selectedLog && (
        <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />
      )}
    </div>
  )
}
