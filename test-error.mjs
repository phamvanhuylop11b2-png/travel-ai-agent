import { callGemini } from "./lib/geminiClient.mjs";

const tools = [
  {
    functionDeclarations: [
      {
        name: "search_hotels",
        description:
          "Tìm kiếm danh sách khách sạn theo khu vực và ngân sách.",
        parameters: {
          type: "OBJECT",
          properties: {
            location: { type: "STRING", description: "Địa điểm cần tìm" },
            max_price: { type: "NUMBER", description: "Giá tối đa (VNĐ)" },
          },
          required: ["location"],
        },
      },
    ],
  },
];

// Hàm giả lập cố tình ném lỗi (mô phỏng lỗi mất kết nối CSDL / API bảo trì)
function searchHotels(args) {
  if (!args.location) {
    throw new Error("Thiếu tham số bắt buộc: location.");
  }
  // Cố tình gây lỗi hệ thống để kiểm thử cơ chế xử lý lỗi
  throw new Error(
    "Không thể kết nối cơ sở dữ liệu khách sạn (503 Service Unavailable)."
  );
}

const SYSTEM_INSTRUCTION = {
  parts: [
    {
      text: "Nếu công cụ trả về lỗi (is_error: true), chỉ thông báo lỗi một cách lịch sự và đề nghị khách thử lại sau. Tuyệt đối không tự liệt kê tên khách sạn hoặc giá phòng từ trí nhớ.",
    },
  ],
};

try {
  const prompt = "Tìm giúp mình khách sạn gần Hồ Núi Cốc giá dưới 1 triệu.";
  console.log("=== BƯỚC 1: Gửi câu hỏi kèm danh sách tool ===");
  console.log("Người dùng:", prompt);

  const data1 = await callGemini({
    systemInstruction: SYSTEM_INSTRUCTION,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    tools,
  });

  const modelContent = data1?.candidates?.[0]?.content;
  const call = modelContent?.parts?.find((p) => p.functionCall)?.functionCall;

  if (!call) {
    console.log("Model trả lời trực tiếp không gọi hàm:", modelContent);
  } else {
    console.log("\n=== BƯỚC 2: LLM yêu cầu gọi hàm ===");
    console.log(`Tên hàm: ${call.name} | Tham số:`, call.args);

    console.log("\n=== BƯỚC 3: Chương trình thực thi và bắt lỗi (try/catch) ===");
    let toolResult;
    try {
      if (call.name !== "search_hotels") {
        throw new Error(`Hàm '${call.name}' không tồn tại.`);
      }
      const hotels = searchHotels(call.args);
      toolResult = { is_error: false, data: hotels };
    } catch (err) {
      console.log("-> Đã bắt được lỗi an toàn:", err.message);
      toolResult = {
        is_error: true,
        error_message: err.message,
      };
    }

    console.log("\n=== BƯỚC 4: Gửi kết quả lỗi về lại cho LLM ===");
    console.log("tool_result:", JSON.stringify(toolResult));

    const data2 = await callGemini({
      systemInstruction: SYSTEM_INSTRUCTION,
      contents: [
        { role: "user", parts: [{ text: prompt }] },
        modelContent,
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                name: call.name,
                response: toolResult,
              },
            },
          ],
        },
      ],
      tools,
    });

    const finalText = data2?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text)
      .filter(Boolean)
      .join("\n");

    console.log("\n=== BƯỚC 5: Câu trả lời cuối cùng của LLM ===");
    console.log(finalText);
  }
} catch (error) {
  console.error("Lỗi:", error.message);
  process.exitCode = 1;
}

