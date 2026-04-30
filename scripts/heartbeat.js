const http = require("http");

console.log("[Heartbeat] Sending ping to localhost:3000/api/heartbeat...");

const req = http.request(
  {
    hostname: "localhost",
    port: 3000,
    path: "/api/heartbeat",
    method: "POST",
  },
  (res) => {
    let data = "";
    res.on("data", (chunk) => {
      data += chunk;
    });
    res.on("end", () => {
      console.log(`[Heartbeat] Response (${res.statusCode}):`, data);
      process.exit(res.statusCode === 200 ? 0 : 1);
    });
  }
);

req.on("error", (err) => {
  console.error("[Heartbeat] Request failed:", err.message);
  process.exit(1);
});

req.end();
