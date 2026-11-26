import { callGemini } from "./lib/geminiClient.mjs";

const tools = [
  {
    functionDeclarations: [
      {
        name: "search_hotels",
        description:
          "Tìm kiếm danh sách khách sạn theo khu vực và ngân sách. Dùng khi người dùng muốn tìm phòng hoặc hỏi giá khách sạn.",
        parameters: {
          type: "OBJECT",
          properties: {
            location: { type: "STRING", description: "Địa điểm cần tìm" },
            max_price: { type: "NUMBER", description: "Giá tối đa (VNĐ)" },
            guests: { type: "INTEGER", description: "Số lượng khách" },
          },
          required: ["location"],
        },
      },
    ],
  },
];

async function testPrompt(title, prompt) {
  console.log(`\n================ ${title} ================`);
  console.log("Câu hỏi:", prompt);

  const data = await callGemini({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools,
  });

  if (!data?.candidates?.[0]) {
    throw new Error("Không nhận được candidates[0] từ Gemini API.");
  }

  console.log("Phản hồi thô từ API (candidates[0]):");
  console.log(JSON.stringify(data.candidates[0], null, 2));
}

try {
  // Trường hợp 1: Cần gọi hàm search_hotels
  await testPrompt(
    "TRƯỜNG HỢP 1: CÓ GỌI HÀM",
    "Tôi muốn tìm khách sạn gần Hồ Núi Cốc giá dưới 1 triệu cho 2 người."
  );

  // Trường hợp 2: Trả lời trực tiếp, không gọi hàm
  await testPrompt(
    "TRƯỜNG HỢP 2: KHÔNG GỌI HÀM",
    "LLM là gì? Trả lời ngắn gọn trong 1 câu."
  );
} catch (error) {
  console.error("Lỗi:", error.message);
  process.exitCode = 1;
}

