import { callGemini } from "./lib/geminiClient.mjs";

// Bước 1: Gọi LLM thuần (KHÔNG có công cụ tìm kiếm) để minh họa hạn chế thiếu dữ liệu thời gian thực
const question =
  process.argv.slice(2).join(" ").trim() ||
  "Thời tiết tại Hồ Núi Cốc, Thái Nguyên hôm nay thế nào và có phù hợp để đi tham quan ngoài trời không?";

try {
  console.log(`[Câu hỏi]: ${question}\n`);

  const data = await callGemini({
    contents: [
      {
        role: "user",
        parts: [{ text: question }],
      },
    ],
  });

  const reply = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join("\n");

  if (!reply) {
    console.error("Không nhận được nội dung trả lời:", JSON.stringify(data, null, 2));
    process.exitCode = 1;
  } else {
    console.log("=== KẾT QUẢ LLM THUẦN (KHÔNG CÓ CÔNG CỤ TÌM KIẾM) ===");
    console.log(reply);
  }
} catch (error) {
  console.error("Lỗi:", error.message);
  process.exitCode = 1;
}
