import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICES_PATH = join(__dirname, "..", "data", "services.json");

/**
 * Tạo kho dữ liệu làm việc trong bộ nhớ (đọc từ services.json)
 * để mỗi phiên chạy test/demo không làm hỏng dữ liệu gốc.
 */
export function createTravelStore(initialServices = null) {
  const baseServices =
    initialServices ?? JSON.parse(readFileSync(SERVICES_PATH, "utf8"));
  const services = baseServices.map((item) => ({ ...item }));
  const bookings = [];

  /**
   * Chuẩn hóa chuỗi tiếng Việt để tìm kiếm không phân biệt hoa/thường và dấu.
   */
  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "d")
      .toLowerCase()
      .trim();
  }

  /**
   * Tool 1 (PI 2.2): Tìm kiếm dịch vụ tour/khách sạn trong dữ liệu hệ thống.
   */
  function search_services({ keyword = "", type = "all", max_price } = {}) {
    const kw = normalizeText(keyword);
    const normalizedType = normalizeText(type || "all");

    const matches = services.filter((svc) => {
      if (normalizedType !== "all" && svc.type !== normalizedType) {
        return false;
      }
      if (typeof max_price === "number" && max_price > 0 && svc.price_vnd > max_price) {
        return false;
      }
      if (!kw) return true;

      const haystack = normalizeText(
        `${svc.name} ${svc.location} ${svc.description}`
      );
      return haystack.includes(kw);
    });

    return {
      ok: true,
      count: matches.length,
      services: matches,
      note:
        matches.length === 0
          ? "Không tìm thấy dịch vụ phù hợp trong hệ thống. Tuyệt đối không tự bịa thêm dịch vụ ngoài danh sách."
          : "Chỉ sử dụng đúng thông tin từ danh sách trên để tư vấn.",
    };
  }

  /**
   * Tool 2 (PI 2.2): Kiểm tra tình trạng còn phòng / chỗ trống theo mã dịch vụ.
   */
  function check_availability({ service_id, check_in_date, quantity = 1 } = {}) {
    const svc = services.find(
      (item) => item.id.toUpperCase() === String(service_id ?? "").trim().toUpperCase()
    );
    if (!svc) {
      return {
        ok: false,
        available: false,
        message: `Không tồn tại dịch vụ với mã '${service_id}'.`,
      };
    }

    const qty = Number(quantity) || 1;
    if (qty <= 0) {
      return {
        ok: false,
        available: false,
        message: "Số lượng phòng/vé phải lớn hơn 0.",
      };
    }

    const available = svc.available_units >= qty;
    return {
      ok: true,
      service_id: svc.id,
      service_name: svc.name,
      check_in_date: check_in_date || "chưa xác định",
      requested_quantity: qty,
      available_units: svc.available_units,
      available,
      price_vnd: svc.price_vnd,
      total_vnd: svc.price_vnd * qty,
    };
  }

  /**
   * Tool 3 (PI 2.2): Tạo đơn đặt dịch vụ ngay trong ngữ cảnh chat và đồng bộ tồn kho.
   */
  function create_booking({
    service_id,
    customer_name,
    check_in_date,
    quantity = 1,
  } = {}) {
    if (!customer_name || !String(customer_name).trim()) {
      return {
        ok: false,
        message: "Thiếu tên khách hàng (customer_name). Hãy hỏi lại khách trước khi tạo đơn.",
      };
    }
    if (!check_in_date || !String(check_in_date).trim()) {
      return {
        ok: false,
        message: "Thiếu ngày nhận phòng/khởi hành (check_in_date). Hãy hỏi lại khách.",
      };
    }

    const availability = check_availability({ service_id, check_in_date, quantity });
    if (!availability.ok || !availability.available) {
      return {
        ok: false,
        message:
          availability.message ||
          `Dịch vụ ${availability.service_name} không đủ chỗ trống (còn ${availability.available_units}).`,
      };
    }

    const svc = services.find((item) => item.id === availability.service_id);
    const qty = availability.requested_quantity;
    svc.available_units -= qty;

    const booking = {
      booking_id: `BK-${String(bookings.length + 1).padStart(4, "0")}`,
      service_id: svc.id,
      service_name: svc.name,
      customer_name: String(customer_name).trim(),
      check_in_date: String(check_in_date).trim(),
      quantity: qty,
      total_vnd: svc.price_vnd * qty,
      status: "CONFIRMED",
      created_at: new Date().toISOString(),
    };
    bookings.push(booking);

    return {
      ok: true,
      message: "Đặt dịch vụ thành công.",
      booking,
      remaining_units: svc.available_units,
    };
  }

  /**
   * Tool 4 (Tuần 1 - API tìm kiếm địa lý thực tế):
   * Gọi Open-Meteo Geocoding API (miễn phí, không cần API key) để tra cứu tọa độ và thông tin địa danh thật.
   */
  async function search_location_api({ query } = {}) {
    const raw = String(query ?? "").trim();
    if (!raw) {
      return { ok: false, message: "Thiếu từ khóa địa điểm cần tìm." };
    }

    // Thử nguyên cụm trước; nếu có dấu phẩy (VD: "Hồ Núi Cốc, Thái Nguyên"), thử thêm phần tỉnh/thành phía sau
    const candidates = [
      raw,
      ...raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .reverse(),
    ].filter((item, idx, arr) => arr.indexOf(item) === idx);

    try {
      for (const term of candidates) {
        const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
        url.searchParams.set("name", term);
        url.searchParams.set("count", "3");
        url.searchParams.set("language", "vi");
        url.searchParams.set("format", "json");

        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) {
          return {
            ok: false,
            message: `API tìm kiếm địa lý trả mã lỗi HTTP ${res.status}`,
          };
        }

        const data = await res.json();
        const items = data.results || [];
        if (items.length > 0) {
          return {
            ok: true,
            source: "Open-Meteo Geocoding API",
            matched_query: term,
            count: items.length,
            places: items.map((p) => ({
              name: [p.name, p.admin1, p.country].filter(Boolean).join(", "),
              lat: p.latitude,
              lon: p.longitude,
              timezone: p.timezone,
            })),
          };
        }
      }

      return {
        ok: true,
        source: "Open-Meteo Geocoding API",
        count: 0,
        places: [],
      };
    } catch (error) {
      return {
        ok: false,
        message: `Không gọi được API tìm kiếm địa lý: ${error.message}`,
      };
    }
  }

  /**
   * Tool 5 (Tuần 1 - API thời tiết thực tế theo thời gian thực):
   * Kết hợp Nominatim lấy tọa độ + Open-Meteo API (miễn phí, không cần API key) lấy thời tiết hôm nay.
   */
  async function get_weather_api({ location = "Hồ Núi Cốc, Thái Nguyên" } = {}) {
    const locRes = await search_location_api({ query: location });
    if (!locRes.ok || locRes.count === 0) {
      return {
        ok: false,
        message: `Không tìm thấy tọa độ địa điểm '${location}' để tra cứu thời tiết.`,
      };
    }

    const place = locRes.places[0];
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", place.lat);
    url.searchParams.set("longitude", place.lon);
    url.searchParams.set(
      "current",
      "temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,wind_speed_10m"
    );
    url.searchParams.set(
      "daily",
      "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max"
    );
    url.searchParams.set("timezone", "Asia/Ho_Chi_Minh");
    url.searchParams.set("forecast_days", "1");

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        return {
          ok: false,
          message: `Open-Meteo API trả mã lỗi HTTP ${res.status}`,
        };
      }

      const weather = await res.json();
      return {
        ok: true,
        source: "Open-Meteo Geocoding & Forecast API",
        resolved_location: place.name,
        latitude: place.lat,
        longitude: place.lon,
        current: weather.current,
        current_units: weather.current_units,
        today: {
          date: weather.daily?.time?.[0],
          temp_min_c: weather.daily?.temperature_2m_min?.[0],
          temp_max_c: weather.daily?.temperature_2m_max?.[0],
          precipitation_sum_mm: weather.daily?.precipitation_sum?.[0],
          precipitation_probability_max_pct:
            weather.daily?.precipitation_probability_max?.[0],
        },
      };
    } catch (error) {
      return {
        ok: false,
        message: `Không lấy được dữ liệu thời tiết thực tế: ${error.message}`,
      };
    }
  }

  async function executeTool(name, args) {
    switch (name) {
      case "search_services":
        return search_services(args);
      case "check_availability":
        return check_availability(args);
      case "create_booking":
        return create_booking(args);
      case "search_location_api":
        return await search_location_api(args);
      case "get_weather_api":
        return await get_weather_api(args);
      default:
        return { ok: false, message: `Tool không được hỗ trợ: ${name}` };
    }
  }

  return {
    services,
    bookings,
    search_services,
    check_availability,
    create_booking,
    search_location_api,
    get_weather_api,
    executeTool,
  };
}

/**
 * Khai báo JSON Schema (functionDeclarations) cho Gemini API theo đúng các hàm trong Đề cương (PI 2.2)
 * và 3 tiêu chí mục 3.4: tên snake_case, mô tả rõ mục đích + thời điểm dùng, tham số đủ kiểu + ví dụ + required.
 */
export const toolDeclarations = [
  {
    name: "search_services",
    description:
      "Tìm kiếm danh sách khách sạn hoặc tour du lịch có thật trong cơ sở dữ liệu hệ thống theo từ khóa khu vực, loại dịch vụ và ngân sách. Sử dụng hàm này khi người dùng hỏi tìm phòng, gợi ý khách sạn/tour hoặc muốn xem giá dịch vụ tại một địa điểm cụ thể.",
    parameters: {
      type: "OBJECT",
      properties: {
        keyword: {
          type: "STRING",
          description:
            "Từ khóa địa điểm hoặc tên dịch vụ cần tìm (ví dụ: 'Hồ Núi Cốc', 'Tân Cương', 'Thái Nguyên'). Bỏ trống nếu muốn xem toàn bộ.",
        },
        type: {
          type: "STRING",
          enum: ["all", "hotel", "tour"],
          description:
            "Loại dịch vụ cần lọc: 'hotel' (khách sạn), 'tour' (tour du lịch) hoặc 'all' (tất cả).",
        },
        max_price: {
          type: "NUMBER",
          description:
            "Mức giá tối đa tính bằng VNĐ (ví dụ: 1000000). Bỏ trống nếu khách không nêu ngân sách.",
        },
      },
      required: ["type"],
    },
  },
  {
    name: "check_availability",
    description:
      "Kiểm tra số lượng phòng/vé còn trống thực tế và tính tổng tiền tạm tính cho một mã dịch vụ. Sử dụng hàm này khi khách hỏi dịch vụ còn chỗ vào ngày cụ thể hay không, hoặc trước khi tạo đơn đặt.",
    parameters: {
      type: "OBJECT",
      properties: {
        service_id: {
          type: "STRING",
          description: "Mã dịch vụ cần kiểm tra (ví dụ: 'HT-01', 'TR-01').",
        },
        check_in_date: {
          type: "STRING",
          description:
            "Ngày nhận phòng hoặc ngày khởi hành theo định dạng YYYY-MM-DD (ví dụ: '2026-12-05').",
        },
        quantity: {
          type: "INTEGER",
          description: "Số lượng phòng hoặc số vé muốn kiểm tra (ví dụ: 2, mặc định là 1).",
        },
      },
      required: ["service_id"],
    },
  },
  {
    name: "create_booking",
    description:
      "Tạo đơn đặt tour hoặc phòng khách sạn chính thức trong hệ thống và đồng bộ trừ tồn kho. Chỉ sử dụng hàm này khi khách hàng đã xác nhận muốn đặt và đã cung cấp đủ mã dịch vụ, họ tên khách hàng, ngày nhận.",
    parameters: {
      type: "OBJECT",
      properties: {
        service_id: {
          type: "STRING",
          description: "Mã dịch vụ cần đặt (ví dụ: 'HT-01').",
        },
        customer_name: {
          type: "STRING",
          description: "Họ và tên đầy đủ của khách hàng đặt dịch vụ (ví dụ: 'Nguyễn Văn An').",
        },
        check_in_date: {
          type: "STRING",
          description:
            "Ngày nhận phòng hoặc ngày khởi hành theo định dạng YYYY-MM-DD (ví dụ: '2026-12-05').",
        },
        quantity: {
          type: "INTEGER",
          description: "Số lượng phòng hoặc vé cần đặt (ví dụ: 1, mặc định là 1).",
        },
      },
      required: ["service_id", "customer_name", "check_in_date"],
    },
  },
  {
    name: "search_location_api",
    description:
      "Tra cứu thông tin địa lý và tọa độ thực tế của một địa danh qua API Open-Meteo Geocoding. Sử dụng hàm này khi cần xác định vị trí, tọa độ địa điểm du lịch thực tế ngoài dữ liệu nội bộ.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: {
          type: "STRING",
          description: "Tên địa danh cần tra cứu tọa độ (ví dụ: 'Hồ Núi Cốc, Thái Nguyên').",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_weather_api",
    description:
      "Tra cứu thời tiết thực tế hôm nay (nhiệt độ, độ ẩm, lượng mưa, xác suất mưa, tốc độ gió) tại một địa điểm du lịch qua API Open-Meteo. Sử dụng hàm này khi khách hỏi về thời tiết hiện tại hoặc khả năng đi tham quan ngoài trời.",
    parameters: {
      type: "OBJECT",
      properties: {
        location: {
          type: "STRING",
          description: "Tên địa điểm du lịch cần xem thời tiết (ví dụ: 'Hồ Núi Cốc, Thái Nguyên').",
        },
      },
      required: ["location"],
    },
  },
];
