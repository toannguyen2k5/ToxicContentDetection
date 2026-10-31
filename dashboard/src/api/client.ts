/**
 * [Owner: A + C]
 * API client: TypeScript interfaces + gọi FastAPI.
 * A: interfaces đầy đủ (PredictionStage, DashboardStats, LogPage...), checkApiHealth
 * C: fetchExtensionLogs → /api/text/logs, fetchLogs → /training-logs, MOCK_LOGS
 */
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const api = axios.create({ baseURL: API_BASE, timeout: 120_000 })

// ─── TypeScript Interfaces (A's full types) ───────────────────────────────
export type PredictionLabel = 'CLEAN' | 'OFFENSIVE' | 'HATE'

export interface LogEntry {
  id: number
  text: string
  label: PredictionLabel
  prob_t1: number | null
  prob_t2: number | null
  tier_used: 1 | 2 | 3
  latency_ms: number
  source_url: string | null
  timestamp: string
}

export interface LogPage {
  items: LogEntry[]
  total: number
}

export interface PredictionStage {
  tier: 1 | 2 | 3
  label: PredictionLabel
  score: number
  confidence?: number
  reason?: string
  latency_ms: number
}

export interface PredictionResult {
  text: string
  toxic: boolean
  label: string
  score: number
  tier: string
  latency_ms: number
  stages: PredictionStage[]
}

export interface DashboardStats {
  total: number
  labels: Record<PredictionLabel, number>
  tiers: Partial<Record<1 | 2 | 3, { count: number; avg_latency_ms: number }>>
  avg_latency_ms: number
}

export interface DashboardCharts {
  labels: Record<PredictionLabel, number>
  daily: { date: string; clean: number; offensive: number; hate: number }[]
  total: number
}

export interface LogStats {
  total: number
  clean: number
  offensive: number
  hate: number
}

// ─── Mock data (C) — fallback khi chưa có data trong /training-logs ──────
export const MOCK_LOGS: LogEntry[] = [
  { id:  1, text: 'gg team chơi hay vậy! top 1 server luôn',               label: 'CLEAN',     prob_t1: 0.97, prob_t2: null, tier_used: 1, latency_ms:  7, source_url: 'https://youtu.be/abc111', timestamp: '2026-09-12T08:01:00' },
  { id:  2, text: 'nước cờ đó hay ghê, học hỏi được nhiều từ bạn',         label: 'CLEAN',     prob_t1: 0.95, prob_t2: null, tier_used: 1, latency_ms:  6, source_url: 'https://youtu.be/abc112', timestamp: '2026-09-12T08:03:10' },
  { id:  3, text: 'stream quality đỉnh, sub ngay không do dự',              label: 'CLEAN',     prob_t1: 0.96, prob_t2: null, tier_used: 1, latency_ms:  8, source_url: 'https://youtu.be/abc113', timestamp: '2026-09-12T08:05:22' },
  { id:  4, text: 'cầm tay đẹp quá trời, ggwp anh ơi',                     label: 'CLEAN',     prob_t1: 0.94, prob_t2: null, tier_used: 1, latency_ms:  7, source_url: 'https://youtu.be/abc114', timestamp: '2026-09-12T08:07:45' },
  { id:  5, text: 'team phối hợp ăn ý thiệt, xem mà phát thèm',            label: 'CLEAN',     prob_t1: 0.93, prob_t2: null, tier_used: 1, latency_ms:  9, source_url: 'https://youtu.be/abc115', timestamp: '2026-09-12T08:10:01' },
  { id:  6, text: 'mày chơi như lợn vậy, uninstall đi cho lành',           label: 'OFFENSIVE', prob_t1: 0.88, prob_t2: null, tier_used: 1, latency_ms: 10, source_url: 'https://youtu.be/abc121', timestamp: '2026-09-12T08:20:00' },
  { id:  7, text: 'thằng này cầm tay dở hơn con nít lớp 1',                label: 'OFFENSIVE', prob_t1: 0.82, prob_t2: 0.91, tier_used: 2, latency_ms:210, source_url: 'https://youtu.be/abc122', timestamp: '2026-09-12T08:22:15' },
  { id:  8, text: 'đồ ngu, cũng đòi đi stream cho người ta xem',           label: 'OFFENSIVE', prob_t1: 0.90, prob_t2: null, tier_used: 1, latency_ms: 11, source_url: 'https://youtu.be/abc123', timestamp: '2026-09-12T08:24:40' },
  { id:  9, text: 'tụi miền Bắc chơi game kiểu đó không ai chịu được',    label: 'HATE',      prob_t1: 0.71, prob_t2: 0.45, tier_used: 3, latency_ms:4200, source_url: 'https://youtu.be/abc131', timestamp: '2026-09-12T08:39:10' },
  { id: 10, text: 'con gái chơi game thì bao giờ giỏi, về nhà nấu cơm đi', label: 'HATE',    prob_t1: 0.68, prob_t2: 0.51, tier_used: 3, latency_ms:3900, source_url: 'https://youtu.be/abc132', timestamp: '2026-09-12T08:41:35' },
]

// ─── API calls (A) ────────────────────────────────────────────────────────

/** [A] Extension / history logs từ SQLite (persistent) */
export async function fetchLogs(limit = 10, offset = 0): Promise<LogPage> {
  const response = await api.get<LogPage>('/api/text/logs', { params: { limit, offset } })
  return response.data
}

/** [A] Stats tổng hợp (total, labels, tiers, avg_latency) */
export async function fetchStats(): Promise<DashboardStats> {
  const response = await api.get<DashboardStats>('/api/text/stats')
  return response.data
}

/** [A] Dữ liệu charts theo ngày */
export async function fetchCharts(): Promise<DashboardCharts> {
  const response = await api.get<DashboardCharts>('/api/text/charts')
  return response.data
}

/** [A] Gọi predict cho một đoạn text */
export async function predictText(text: string): Promise<PredictionResult> {
  const response = await api.post<PredictionResult>('/api/text/predict', { text })
  return response.data
}

/** [A] Kiểm tra API health (ping /health) */
export async function checkApiHealth(): Promise<boolean> {
  const response = await api.get<{ status: string }>('/health')
  return response.data.status === 'ok'
}

// ─── API calls (C) ────────────────────────────────────────────────────────

/** [C] LogViewer: 33k rows thật từ labels_agreed.csv */
export async function fetchTrainingLogs(
  limit = 200,
  skip  = 0,
  label = 'all'
): Promise<{ logs: LogEntry[]; total: number; stats: LogStats }> {
  try {
    const res = await api.get<{ logs: LogEntry[]; total: number; stats: LogStats }>(
      `/api/text/training-logs?limit=${limit}&skip=${skip}&label=${label}`
    )
    return res.data
  } catch {
    return { logs: MOCK_LOGS, total: MOCK_LOGS.length, stats: { total: 10, clean: 5, offensive: 3, hate: 2 } }
  }
}

/** [C] ExtensionLogs: stats nhanh (tổng, clean, offensive, hate) từ SQLite */
export async function fetchExtensionStats(): Promise<LogStats> {
  const res = await api.get<{ total: number; labels: Record<PredictionLabel, number> }>(
    '/api/text/stats'
  )
  return {
    total:     res.data.total,
    clean:     res.data.labels?.CLEAN     ?? 0,
    offensive: res.data.labels?.OFFENSIVE ?? 0,
    hate:      res.data.labels?.HATE      ?? 0,
  }
}
