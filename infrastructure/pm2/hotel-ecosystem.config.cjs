const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "../..");

module.exports = {
  apps: [
    {
      name: "hotel-web",
      cwd: repositoryRoot,
      script: "pnpm",
      args: "--filter @hotel/web start",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3020,
      },
      error_file: path.join(repositoryRoot, "logs", "pm2", "hotel-web-error.log"),
      out_file: path.join(repositoryRoot, "logs", "pm2", "hotel-web-out.log"),
      merge_logs: false,
      time: true,
    },
    {
      name: "hotel-api",
      cwd: repositoryRoot,
      script: "pnpm",
      args: "--filter @hotel/api start",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3021,
      },
      error_file: path.join(repositoryRoot, "logs", "pm2", "hotel-api-error.log"),
      out_file: path.join(repositoryRoot, "logs", "pm2", "hotel-api-out.log"),
      merge_logs: false,
      time: true,
    },
  ],
};
