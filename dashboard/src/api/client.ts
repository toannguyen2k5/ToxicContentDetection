/**
 * [Owner: C] — Task C-18
 * API client: định nghĩa TypeScript interfaces + gọi FastAPI.
 * Fallback về mock data khi FastAPI chưa sẵn sàng (giai đoạn demo).
 */
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

const api = axios.create({ baseURL: API_BASE, timeout: 8000 })

// ─── TypeScript Interfaces (đồng bộ với log schema A-19c) ────────────────
export interface LogEntry {
  id: number
  text: string
  label: 'CLEAN' | 'OFFENSIVE' | 'HATE'
  prob_t1: number
  prob_t2: number
  tier_used: 1 | 2 | 3
  latency_ms: number
  source_url: string
  timestamp: string
}

// ─── Mock data (20 comment thực tế — dùng khi FastAPI chưa chạy) ─────────
export const MOCK_LOGS: LogEntry[] = [
  { id:  1, text: 'gg team chơi hay vậy! top 1 server luôn',               label: 'CLEAN',     prob_t1: 0.97, prob_t2: 0.00, tier_used: 1, latency_ms:  7, source_url: 'https://youtu.be/abc111', timestamp: '2026-09-12T08:01:00' },
  { id:  2, text: 'nước cờ đó hay ghê, học hỏi được nhiều từ bạn',         label: 'CLEAN',     prob_t1: 0.95, prob_t2: 0.00, tier_used: 1, latency_ms:  6, source_url: 'https://youtu.be/abc112', timestamp: '2026-09-12T08:03:10' },
  { id:  3, text: 'stream quality đỉnh, sub ngay không do dự',              label: 'CLEAN',     prob_t1: 0.96, prob_t2: 0.00, tier_used: 1, latency_ms:  8, source_url: 'https://youtu.be/abc113', timestamp: '2026-09-12T08:05:22' },
  { id:  4, text: 'cầm tay đẹp quá trời, ggwp anh ơi',                     label: 'CLEAN',     prob_t1: 0.94, prob_t2: 0.00, tier_used: 1, latency_ms:  7, source_url: 'https://youtu.be/abc114', timestamp: '2026-09-12T08:07:45' },
  { id:  5, text: 'team phối hợp ăn ý thiệt, xem mà phát thèm',            label: 'CLEAN',     prob_t1: 0.93, prob_t2: 0.00, tier_used: 1, latency_ms:  9, source_url: 'https://youtu.be/abc115', timestamp: '2026-09-12T08:10:01' },
  { id:  6, text: 'hôm nay bạn chơi ổn hơn nhiều rồi, tiến bộ thật sự',   label: 'CLEAN',     prob_t1: 0.92, prob_t2: 0.00, tier_used: 1, latency_ms:  6, source_url: 'https://youtu.be/abc116', timestamp: '2026-09-12T08:12:30' },
  { id:  7, text: 'game này hay vãi, tải về chơi thử xem sao',             label: 'CLEAN',     prob_t1: 0.91, prob_t2: 0.00, tier_used: 1, latency_ms:  7, source_url: 'https://youtu.be/abc117', timestamp: '2026-09-12T08:14:55' },
  { id:  8, text: 'bạn này giải thích rõ quá, dễ hiểu hơn tutorial khác',  label: 'CLEAN',     prob_t1: 0.95, prob_t2: 0.00, tier_used: 1, latency_ms:  8, source_url: 'https://youtu.be/abc118', timestamp: '2026-09-12T08:17:20' },
  { id:  9, text: 'mày chơi như lợn vậy, uninstall đi cho lành',           label: 'OFFENSIVE', prob_t1: 0.88, prob_t2: 0.00, tier_used: 1, latency_ms: 10, source_url: 'https://youtu.be/abc121', timestamp: '2026-09-12T08:20:00' },
  { id: 10, text: 'thằng này cầm tay dở hơn con nít lớp 1',                label: 'OFFENSIVE', prob_t1: 0.82, prob_t2: 0.91, tier_used: 2, latency_ms:210, source_url: 'https://youtu.be/abc122', timestamp: '2026-09-12T08:22:15' },
  { id: 11, text: 'đồ ngu, cũng đòi đi stream cho người ta xem',           label: 'OFFENSIVE', prob_t1: 0.90, prob_t2: 0.00, tier_used: 1, latency_ms: 11, source_url: 'https://youtu.be/abc123', timestamp: '2026-09-12T08:24:40' },
  { id: 12, text: 'chơi kiểu gì vậy, tệ vãi chờ, đi học lại đi',          label: 'OFFENSIVE', prob_t1: 0.76, prob_t2: 0.88, tier_used: 2, latency_ms:198, source_url: 'https://youtu.be/abc124', timestamp: '2026-09-12T08:27:05' },
  { id: 13, text: 'vcl con này cầm game như mù, hết xem luôn',             label: 'OFFENSIVE', prob_t1: 0.85, prob_t2: 0.00, tier_used: 1, latency_ms:  9, source_url: 'https://youtu.be/abc125', timestamp: '2026-09-12T08:29:30' },
  { id: 14, text: 'thất vọng quá, chơi dở như gà, bỏ nghề đi',            label: 'OFFENSIVE', prob_t1: 0.83, prob_t2: 0.00, tier_used: 1, latency_ms: 10, source_url: 'https://youtu.be/abc126', timestamp: '2026-09-12T08:31:55' },
  { id: 15, text: 'mặt ngu như bò mà cũng đòi top 1, cười vãi',           label: 'OFFENSIVE', prob_t1: 0.79, prob_t2: 0.87, tier_used: 2, latency_ms:205, source_url: 'https://youtu.be/abc127', timestamp: '2026-09-12T08:34:20' },
  { id: 16, text: 'anh chơi được đấy nhưng mà giải thích hơi dài',        label: 'CLEAN',     prob_t1: 0.55, prob_t2: 0.72, tier_used: 2, latency_ms:185, source_url: 'https://youtu.be/abc119', timestamp: '2026-09-12T08:36:45' },
  { id: 17, text: 'tụi miền Bắc chơi game kiểu đó không ai chịu được',    label: 'HATE',      prob_t1: 0.71, prob_t2: 0.45, tier_used: 3, latency_ms:4200, source_url: 'https://youtu.be/abc131', timestamp: '2026-09-12T08:39:10' },
  { id: 18, text: 'con gái chơi game thì bao giờ giỏi, về nhà nấu cơm đi', label: 'HATE',     prob_t1: 0.68, prob_t2: 0.51, tier_used: 3, latency_ms:3900, source_url: 'https://youtu.be/abc132', timestamp: '2026-09-12T08:41:35' },
  { id: 19, text: 'dân tỉnh lẻ chơi game toàn hại đồng đội, báo cáo hết', label: 'HATE',      prob_t1: 0.65, prob_t2: 0.48, tier_used: 3, latency_ms:4100, source_url: 'https://youtu.be/abc133', timestamp: '2026-09-12T08:44:00' },
  { id: 20, text: 'stream này hay thiệt, lần sau làm thêm về tướng này nha', label: 'CLEAN',   prob_t1: 0.97, prob_t2: 0.00, tier_used: 1, latency_ms:  6, source_url: 'https://youtu.be/abc120', timestamp: '2026-09-12T08:46:25' },
]

// ─── API calls ────────────────────────────────────────────────────────────

/**
 * Lấy danh sách log từ FastAPI.
 * Fallback về MOCK_LOGS nếu API chưa sẵn sàng.
 */
export async function fetchLogs(): Promise<LogEntry[]> {
  try {
    const res = await api.get<LogEntry[]>('/api/text/logs')
    return res.data
  } catch {
    // API chưa chạy → dùng mock data để demo
    return MOCK_LOGS
  }
}
