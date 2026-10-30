import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const api = axios.create({ baseURL: API_BASE, timeout: 120_000 })

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

export async function fetchLogs(limit = 10, offset = 0): Promise<LogPage> {
  const response = await api.get<LogPage>('/api/text/logs', { params: { limit, offset } })
  return response.data
}

export async function fetchStats(): Promise<DashboardStats> {
  const response = await api.get<DashboardStats>('/api/text/stats')
  return response.data
}

export async function fetchCharts(): Promise<DashboardCharts> {
  const response = await api.get<DashboardCharts>('/api/text/charts')
  return response.data
}

export async function predictText(text: string): Promise<PredictionResult> {
  const response = await api.post<PredictionResult>('/api/text/predict', { text })
  return response.data
}

export async function checkApiHealth(): Promise<boolean> {
  const response = await api.get<{ status: string }>('/health')
  return response.data.status === 'ok'
}
