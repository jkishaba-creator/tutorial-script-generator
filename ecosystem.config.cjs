module.exports = {
  apps: [
    {
      name: "factory-floor",
      script: "npm",
      args: "start",
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
  ],
};
