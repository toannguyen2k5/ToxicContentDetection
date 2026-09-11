import axios from "axios";

// Đọc từ biến môi trường build-time thay vì hardcode
const API_URL = process.env.REACT_APP_API_URL || "http://localhost:8000";

export const apiClient = axios.create({ baseURL: API_URL });
