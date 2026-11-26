import { callGemini as requestGemini } from "./lib/geminiClient.mjs";

const tools = [
  {
    functionDeclarations: [
      {
        name: "get_weather",
        description:
          "Lấy thời tiết hiện tại của một thành phố. Dùng khi người dùng hỏi về thời tiết.",
        parameters: {
          type: "OBJECT",
          properties: {
            city: { type: "STRING", description: "Tên thành phố" },
          },
          required: ["city"],
        },
      },
    ],
  },
];

// Dữ liệu giả lập để minh họa luồng chạy (giống tài liệu)
const functions = {
  get_weather: ({ city }) => ({
    city,
    condition: "mưa vừa",
    temp_c: 24,
  }),
};

async function callGemini(contents) {
  return requestGemini({ contents, tools });
}

async function main() {
  const prompt = "Thời tiết ở Thái Nguyên hôm nay thế nào?";
  console.log("=== NGƯỜI DÙNG HỎI ===");
  console.log(prompt);

  const contents = [{ role: "user", parts: [{ text: prompt }] }];
  let data = await callGemini(contents);
  let rounds = 0;

  while (rounds < 5) {
    const modelContent = data?.candidates?.[0]?.content;
    if (!modelContent) {
      throw new Error("Không nhận được phản hồi hợp lệ từ Gemini.");
    }

    const toolCalls = (modelContent.parts || []).filter((p) => p.functionCall);
    if (toolCalls.length === 0) break;

    rounds++;
    contents.push(modelContent);

    const results = [];
    for (const part of toolCalls) {
      const { name, args } = part.functionCall;
      console.log(`\n=== VÒNG ${rounds} - [tool_use] LLM YÊU CẦU GỌI HÀM ===`);
      console.log(JSON.stringify({ name, args }, null, 2));

      let out;
      try {
        if (typeof functions[name] !== "function") {
          throw new Error(`Hàm '${name}' không tồn tại.`);
        }
        out = functions[name](args ?? {});
      } catch (e) {
        out = { is_error: true, message: "Lỗi: " + e.message };
      }

      console.log(
        `\n=== VÒNG ${rounds} - [tool_result] KẾT QUẢ HÀM TRẢ VỀ ===`
      );
      console.log(JSON.stringify(out, null, 2));

      results.push({
        functionResponse: { name, response: out },
      });
    }

    contents.push({ role: "user", parts: results });
    data = await callGemini(contents);
  }

  const finalAnswer = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text)
    .filter(Boolean)
    .join("\n");

  console.log("\n=== CÂU TRẢ LỜI CUỐI CÙNG CỦA LLM ===");
  console.log(finalAnswer);
}

main().catch((err) => {
  console.error("Lỗi:", err.message);
  process.exitCode = 1;
});

