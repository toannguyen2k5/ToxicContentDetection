/**
 * [Owner: C] — Task C-19, C-25
 * ModelStats: hiển thị F1, Precision, Recall, Accuracy.
 * Ported từ ModelStats.jsx → adapted sang glassmorphism theme.
 * TODO Sprint 6: kết nối GET /stats để lấy số thật từ compare_models.ipynb
 */
export default function ModelStats() {
  // Mock data từ compare_models.ipynb (sẽ thay bằng API call)
  const metrics = [
    { label: 'F1 Score',  value: 0.89, color: 'var(--accent)',  bg: 'rgba(102,126,234,0.12)' },
    { label: 'Precision', value: 0.91, color: 'var(--success)', bg: 'rgba(81,207,102,0.10)'  },
    { label: 'Recall',    value: 0.87, color: 'var(--warning)', bg: 'rgba(255,169,77,0.10)'  },
    { label: 'Accuracy',  value: 0.90, color: '#c084fc',        bg: 'rgba(192,132,252,0.10)' },
  ]

  const modelRows = [
    { name: 'Tier 1 · SVM',   f1: 0.82, precision: 0.84, recall: 0.80, status: '⏳ Đang cập nhật' },
    { name: 'Tier 2 · BERT',  f1: 0.89, precision: 0.91, recall: 0.87, status: '⏳ Đang cập nhật' },
    { name: 'Tier 3 · Qwen3', f1: '—',  precision: '—',  recall: '—',  status: '✅ Đang chạy'     },
  ]

  return (
    <div>
      <div className="page-header">
        <h1>📊 Model Stats</h1>
        <p>Chỉ số hiệu suất của các model trong cascade · Mock data từ compare_models.ipynb</p>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
        {metrics.map(m => (
          <div key={m.label} className="card" style={{ textAlign: 'center', background: m.bg }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
              {m.label}
            </div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: m.color }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {/* Model comparison table */}
      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 14, fontSize: '0.9rem' }}>
          So sánh theo model
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Model</th>
                <th>F1 Score</th>
                <th>Precision</th>
                <th>Recall</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {modelRows.map(row => (
                <tr key={row.name}>
                  <td style={{ fontWeight: 600 }}>{row.name}</td>
                  <td className="col-prob">{row.f1}</td>
                  <td className="col-prob">{row.precision}</td>
                  <td className="col-prob">{row.recall}</td>
                  <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          ⚠️ Số liệu mock — sẽ thay bằng GET /stats sau khi train xong Sprint 6
        </div>
      </div>
    </div>
  )
}
