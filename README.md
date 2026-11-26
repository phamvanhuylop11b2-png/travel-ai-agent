# Travel AI Agent — POC Tuần 1 (`test-llm`)

Mã nguồn thử nghiệm **Tuần 1** cho đồ án *"Phát triển hệ thống tư vấn và đặt dịch vụ du lịch thông minh ứng dụng AI Agent"* (SV: Phạm Văn Huy — GVHD: TS. Bùi Anh Tú).

## Cấu trúc thư mục
- `.env.example` — Mẫu biến môi trường (`GEMINI_API_KEY`, `SEARCH_API_KEY`). File `.env` thật được loại trừ qua `.gitignore`.
- `lib/geminiClient.mjs` — Client gọi Gemini REST API (`gemini-3.1-flash-lite`) kèm timeout, retry và model dự phòng.
- `index.mjs` — Minh họa gọi LLM thuần (không có công cụ tìm kiếm).
- `search.mjs` — Minh họa gọi Tavily Search API lấy dữ liệu web thực tế.
- `agent-demo.mjs` — Minh họa quy trình 6 bước AI Agent kết hợp Tavily Search API + Gemini LLM.
- `test-decision.mjs` — Minh họa cách LLM quyết định giữa `functionCall` và trả lời `text` trực tiếp.
- `test-error.mjs` — Minh họa xử lý lỗi an toàn (`try/catch`) khi công cụ gặp sự cố `503` và chống ảo giác.
- `demo-fc.mjs` — Minh họa vòng lặp Function Calling (`[tool_use]` → `[tool_result]` → câu trả lời cuối).
- `tools/travelTools.mjs` — Khai báo `toolDeclarations` và cài đặt 5 tools (`search_services`, `check_availability`, `create_booking`, `search_location_api`, `get_weather_api`).
- `function-calling.mjs` — AI Agent tư vấn & đặt dịch vụ du lịch chống ảo giác (hỗ trợ `--demo`, `--ask` và chat tương tác).
- `data/services.json` — Dữ liệu mẫu khách sạn & tour quanh Hồ Núi Cốc / Thái Nguyên.
- `test-tools.mjs` — Kiểm thử tự động tầng Tools và schema `functionDeclarations`.

## Cài đặt & Chạy thử
Yêu cầu **Node.js >= 20.6** (đã kiểm thử trên Node `v24.18.0`, không cần cài thư viện ngoài).

```powershell
# 1. Tạo file .env từ mẫu và điền API Key thật của bạn
Copy-Item .env.example .env

# 2. Chạy kiểm thử tầng Tools (offline, không cần API key)
npm test

# 3. Chạy các script minh họa
npm start                 # LLM thuần (index.mjs)
npm run search            # Tavily Search API (search.mjs)
npm run agent:demo        # Quy trình 6 bước Tavily + Gemini (agent-demo.mjs)
npm run test:decision     # Kiểm tra quyết định functionCall vs text (test-decision.mjs)
npm run test:error        # Kiểm tra xử lý lỗi 503 an toàn (test-error.mjs)
npm run demo:fc           # Vòng lặp Function Calling cơ bản (demo-fc.mjs)
npm run fc:weather        # Tra cứu thời tiết Hồ Núi Cốc thời gian thực
npm run fc:demo           # Kịch bản AI Agent đặt phòng Hồ Núi Cốc end-to-end
npm run fc                # Chat tương tác trực tiếp trên terminal
```
