import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite";
const FALLBACK_MODELS = [
  DEFAULT_MODEL,
  "gemini-flash-lite-latest",
  "gemini-3.8-flash",
].filter((m, idx, arr) => arr.indexOf(m) === idx);

const RETRYABLE_STATUS = new Set([429, 500, 503]);
const REQUEST_TIMEOUT_MS = 20000;

/**
 * Kiểm tra API key đã được cấu hình hợp lệ trong biến môi trường chưa.
 */
export function requireGeminiApiKey() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === "dan_ma_api_key_cua_ban_vao_day") {
    throw new Error(
      "Thiếu GEMINI_API_KEY hợp lệ. Hãy mở file .env và dán API key lấy từ https://aistudio.google.com/apikey, sau đó chạy bằng lệnh: node --env-file=.env <ten_file.mjs>"
    );
  }
  return apiKey;
}

/**
 * Gọi Gemini generateContent REST API với timeout, retry và model dự phòng khi quá tải (429/503).
 */
export async function callGemini(payload) {
  const apiKey = requireGeminiApiKey();
  let lastError = null;

  for (const model of FALLBACK_MODELS) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        const data = await res.json();
        if (res.ok) {
          return data;
        }

        const message = data?.error?.message || `HTTP ${res.status}`;
        lastError = new Error(`Gemini API lỗi (${model}): ${message}`);

        if (!RETRYABLE_STATUS.has(res.status)) {
          throw lastError;
        }
      } catch (err) {
        if (err.name === "TimeoutError" || err.name === "AbortError") {
          lastError = new Error(`Gemini API timeout (${model}) sau ${REQUEST_TIMEOUT_MS / 1000}s`);
        } else {
          throw err;
        }
      }

      if (attempt === 1) {
        await delay(1200);
      }
    }
  }

  throw lastError ?? new Error("Không gọi được Gemini API.");
}
