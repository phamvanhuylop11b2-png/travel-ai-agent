const apiKey = process.env.SEARCH_API_KEY?.trim();
if (!apiKey || apiKey === "tvly-dan_ma_api_key_cua_ban_o_day") {
  console.error(
    "Lỗi: Thiếu SEARCH_API_KEY hợp lệ. Hãy mở file .env và dán mã Tavily API Key (tvly-...) rồi chạy lại: node --env-file=.env search.mjs"
  );
  process.exitCode = 1;
} else {
  async function searchWeb(query) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: 3,
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Search API lỗi (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return (data.results || []).map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
    }));
  }

  try {
    const query =
      process.argv.slice(2).join(" ").trim() ||
      "khách sạn gần Hồ Núi Cốc Thái Nguyên";
    const results = await searchWeb(query);
    console.log(JSON.stringify(results, null, 2));
  } catch (error) {
    console.error("Lỗi:", error.message);
    process.exitCode = 1;
  }
}

