module.exports = {
  apps: [
    {
      name: "chat-with-website",
      script: "npm",
      args: "start",
      // CRITICAL: Use 'fork' mode (single instance) for local embedded LanceDB
      // to avoid multi-process filesystem lock contention during indexing.
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
        VECTOR_DB: "lancedb",
        LANCEDB_URI: "./data/lancedb",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      merge_logs: true,
    },
  ],
};
