import { callGemini } from "./lib/geminiClient.mjs";

const searchApiKey = process.env.SEARCH_API_KEY?.trim();
if (!searchApiKey || searchApiKey === "tvly-dan_ma_api_key_cua_ban_o_day") {
  console.error(
    "Lỗi: Thiếu SEARCH_API_KEY hợp lệ trong file .env. Hãy kiểm tra lại biến SEARCH_API_KEY."
  );
  process.exitCode = 1;
} else {
  const question =
    process.argv.slice(2).join(" ").trim() ||
    "Tình hình mưa bão tại Thái Nguyên hiện nay thế nào?";

  try {
    console.log("=== BƯỚC 1: AI Agent tiếp nhận câu hỏi ===");
    console.log("Người dùng:", question);

    console.log("\n=== BƯỚC 2: LLM phân tích yêu cầu ===");
    console.log(
      "-> Nhận thấy câu hỏi cần thông tin thời gian thực -> Quyết định gọi Search API."
    );

    console.log("\n=== BƯỚC 3 & 4: Gọi Tavily Search API và nhận kết quả ===");
    const searchRes = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${searchApiKey}`,
      },
      body: JSON.stringify({
        query: question,
        max_results: 3,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!searchRes.ok) {
      const errText = await searchRes.text();
      throw new Error(`Tavily API lỗi (${searchRes.status}): ${errText}`);
    }
    const searchData = await searchRes.json();
    const results = searchData.results || [];

    const context = results
      .map(
        (r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\nNội dung: ${r.content}`
      )
      .join("\n\n");

    console.log(`-> Đã lấy được ${results.length} nguồn tin mới nhất.`);

    console.log("\n=== BƯỚC 5: LLM đọc và tổng hợp thông tin ===");
    const llmData = await callGemini({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `Dựa vào các kết quả tìm kiếm sau, hãy trả lời ngắn gọn câu hỏi: "${question}". Bắt buộc trích dẫn rõ đường link nguồn ở cuối câu trả lời.\n\nKết quả tìm kiếm:\n${context}`,
            },
          ],
        },
      ],
    });

    const answer = llmData?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join("\n");

    if (!answer) {
      throw new Error("Không nhận được nội dung phản hồi từ Gemini.");
    }

    console.log(
      "\n=== BƯỚC 6: AI Agent trả lời người dùng (kèm nguồn) ==="
    );
    console.log(answer);
  } catch (error) {
    console.error("Lỗi:", error.message);
    process.exitCode = 1;
  }
}

