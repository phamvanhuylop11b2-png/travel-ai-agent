import assert from "node:assert/strict";
import { createTravelStore, toolDeclarations } from "./tools/travelTools.mjs";

// Kiểm tra tự động tầng Tools (không cần GEMINI_API_KEY)
const store = createTravelStore();

// 1. Tìm khách sạn gần Hồ Núi Cốc giá dưới 1 triệu
const searchRes = store.search_services({
  keyword: "Hồ Núi Cốc",
  type: "hotel",
  max_price: 1000000,
});
assert.equal(searchRes.ok, true);
assert.equal(searchRes.count, 2);
assert.deepEqual(
  searchRes.services.map((s) => s.id),
  ["HT-01", "HT-02"]
);

// 2. Test chống ảo giác: khu vực không có trong DB phải trả về count = 0
const emptyRes = store.search_services({ keyword: "Đà Lạt", type: "hotel" });
assert.equal(emptyRes.ok, true);
assert.equal(emptyRes.count, 0);

// 3. Kiểm tra phòng trống HT-01 và TR-02 (hết chỗ)
const availOk = store.check_availability({
  service_id: "HT-01",
  check_in_date: "2026-12-05",
  quantity: 2,
});
assert.equal(availOk.available, true);
assert.equal(availOk.total_vnd, 1500000);

const availFull = store.check_availability({
  service_id: "TR-02",
  check_in_date: "2026-12-05",
  quantity: 1,
});
assert.equal(availFull.available, false);

// 4. Tạo đơn đặt dịch vụ và kiểm tra trừ tồn kho đồng bộ
const bookingRes = store.create_booking({
  service_id: "HT-01",
  customer_name: "Phạm Văn Huy",
  check_in_date: "2026-12-05",
  quantity: 2,
});
assert.equal(bookingRes.ok, true);
assert.equal(bookingRes.booking.booking_id, "BK-0001");
assert.equal(bookingRes.remaining_units, 3);

// 5. Kiểm tra thiếu tên khách hàng không được tạo đơn
const missingCustomer = store.create_booking({
  service_id: "HT-01",
  check_in_date: "2026-12-05",
});
assert.equal(missingCustomer.ok, false);

// 6. Kiểm tra schema functionDeclarations có đủ 5 tools và đạt 3 tiêu chí mục 3.4
assert.deepEqual(
  toolDeclarations.map((t) => t.name),
  [
    "search_services",
    "check_availability",
    "create_booking",
    "search_location_api",
    "get_weather_api",
  ]
);

for (const tool of toolDeclarations) {
  assert.match(tool.name, /^[a-z]+(_[a-z]+)*$/);
  assert.ok(tool.description.includes("Sử dụng hàm này khi") || tool.description.includes("sử dụng hàm này khi"));
  assert.ok(Array.isArray(tool.parameters.required) && tool.parameters.required.length > 0);
  for (const prop of Object.values(tool.parameters.properties)) {
    assert.ok(prop.type && prop.description);
  }
}

console.log("PASS: Tất cả 6 bài kiểm thử tầng Tools & đạt chuẩn schema mục 3.4!");

