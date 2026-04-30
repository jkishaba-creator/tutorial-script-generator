module.exports = {
  apps: [
    {
      name: "factory-floor",
      // Caffeinate prevents Mac sleep. -i prevents idle sleep, -s prevents system sleep.
      script: "caffeinate",
      args: "-i -s npm start",
      autorestart: true,
      max_restarts: 10,
      max_memory_restart: "1500M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      log_date_format: "YYYY-MM-DD HH:mm Z",
    },
    {
      name: "cf-tunnel",
      script: "cloudflared",
      args: "tunnel --url http://localhost:3000 run factory-floor",
      autorestart: true,
      max_restarts: 10,
      log_date_format: "YYYY-MM-DD HH:mm Z",
    },
    {
      name: "heartbeat",
      script: "./scripts/heartbeat.js",
      instances: 1,
      exec_mode: "fork",
      // Run every day at 8:00 AM
      cron_restart: "0 8 * * *",
      autorestart: false, // We only want it to run on the cron schedule
      log_date_format: "YYYY-MM-DD HH:mm Z",
    }
  ],
};
