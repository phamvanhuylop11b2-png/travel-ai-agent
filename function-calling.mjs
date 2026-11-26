import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { callGemini } from "./lib/geminiClient.mjs";
import { createTravelStore, toolDeclarations } from "./tools/travelTools.mjs";

const SYSTEM_PROMPT = `Bạn là Trợ lý AI tư vấn và đặt dịch vụ du lịch thông minh.
QUY TẮC BẮT BUỘC (Chống ảo giác - Hallucination):
1. KHÔNG BAO GIỜ tự bịa tên khách sạn, tour, giá tiền hoặc tình trạng phòng trống. Mọi thông tin dịch vụ phải lấy từ kết quả trả về của công cụ search_services hoặc check_availability.
2. Nếu công cụ tìm kiếm trả về rỗng (count = 0), hãy thông báo trung thực là hệ thống hiện chưa có dịch vụ phù hợp tại khu vực đó.
3. Khi người dùng muốn đặt dịch vụ, hãy kiểm tra xem đã có đủ: mã dịch vụ (service_id), tên khách hàng (customer_name) và ngày nhận (check_in_date) chưa. Nếu thiếu, hãy hỏi lại khách trước khi gọi create_booking.
4. Trả lời bằng tiếng Việt ngắn gọn, rõ ràng, thân thiện.`;

const MAX_TOOL_STEPS = 5;

/**
 * Chạy 1 lượt hội thoại với vòng lặp Function Calling hoàn chỉnh:
 * User -> Gemini (functionCall) -> Thực thi Tool thật -> Gemini (câu trả lời cuối).
 */
async function runAgentTurn(history, userMessage, store) {
  history.push({
    role: "user",
    parts: [{ text: userMessage }],
  });

  for (let step = 1; step <= MAX_TOOL_STEPS; step++) {
    const data = await callGemini({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: history,
      tools: [{ functionDeclarations: toolDeclarations }],
      generationConfig: {
        temperature: 0.2,
      },
    });

    const candidateContent = data?.candidates?.[0]?.content;
    if (!candidateContent) {
      throw new Error("Gemini không trả về candidate hợp lệ.");
    }

    // Lưu nguyên content của model (giữ cả functionCall và thought parts nếu có)
    history.push(candidateContent);

    const parts = candidateContent.parts || [];
    const functionCalls = parts
      .filter((p) => p.functionCall)
      .map((p) => p.functionCall);

    // Nếu model không yêu cầu gọi hàm nữa -> lấy text trả lời cuối cùng
    if (functionCalls.length === 0) {
      const finalText = parts
        .map((p) => p.text)
        .filter(Boolean)
        .join("\n");
      return finalText || "(AI không có nội dung phản hồi)";
    }

    // Thực thi từng tool mà AI yêu cầu
    const responseParts = [];
    for (const fc of functionCalls) {
      console.log(
        `  [Tool Call #${step}] ${fc.name}(${JSON.stringify(fc.args ?? {})})`
      );
      const toolResult = await store.executeTool(fc.name, fc.args ?? {});
      console.log(`  [Tool Result]    ${JSON.stringify(toolResult)}`);

      responseParts.push({
        functionResponse: {
          name: fc.name,
          response: toolResult,
        },
      });
    }

    history.push({
      role: "user",
      parts: responseParts,
    });
  }

  return "Đã vượt quá số bước gọi công cụ tối đa trong một lượt hỏi.";
}

async function runDemo(store) {
  const history = [];
  const demoPrompts = [
    "Tôi muốn ở khách sạn gần Hồ Núi Cốc, giá dưới 1 triệu.",
    "Kiểm tra giúp tôi khách sạn HT-01 ngày 2026-12-05 cho 2 phòng còn không?",
    "Đặt giúp tôi 1 phòng HT-01 ngày 2026-12-05 cho khách Nguyễn Văn An.",
    "Ở Đà Lạt bên bạn có khách sạn nào không?",
  ];

  console.log("=== DEMO FUNCTION CALLING (TUẦN 1 - ĐỒ ÁN AI AGENT DU LỊCH) ===");
  for (const prompt of demoPrompts) {
    console.log(`\n[Khách hàng]: ${prompt}`);
    const reply = await runAgentTurn(history, prompt, store);
    console.log(`[AI Agent]:\n${reply}`);
  }

  console.log("\n=== ĐƠN ĐẶT ĐÃ LƯU TRONG HỆ THỐNG ===");
  console.log(JSON.stringify(store.bookings, null, 2));
}

async function runInteractive(store) {
  const rl = createInterface({ input, output });
  const history = [];

  console.log("=== TRỢ LÝ AI DU LỊCH (FUNCTION CALLING POC) ===");
  console.log("Gõ câu hỏi (hoặc 'exit' để thoát). Ví dụ: 'Tôi muốn ở khách sạn gần Hồ Núi Cốc'\n");

  try {
    while (true) {
      const userInput = (await rl.question("Bạn: ")).trim();
      if (!userInput) continue;
      if (["exit", "quit", "thoat"].includes(userInput.toLowerCase())) {
        break;
      }

      const reply = await runAgentTurn(history, userInput, store);
      console.log(`\nAI Agent: ${reply}\n`);
    }
  } finally {
    rl.close();
  }
}

try {
  const store = createTravelStore();
  const askIdx = process.argv.indexOf("--ask");
  if (askIdx !== -1) {
    const question = process.argv.slice(askIdx + 1).join(" ").trim();
    if (!question) {
      throw new Error("Thiếu nội dung câu hỏi sau --ask.");
    }
    console.log("=== AI AGENT (CÓ CÔNG CỤ TÌM KIẾM THỜI GIAN THỰC) ===");
    console.log(`[Khách hàng]: ${question}`);
    const reply = await runAgentTurn([], question, store);
    console.log(`\n[AI Agent]:\n${reply}`);
  } else if (process.argv.includes("--demo")) {
    await runDemo(store);
  } else {
    await runInteractive(store);
  }
} catch (error) {
  console.error("Lỗi:", error.message);
  process.exitCode = 1;
}

