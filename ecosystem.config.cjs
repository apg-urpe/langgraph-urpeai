/**
 * PM2 Ecosystem Config — URPE AI Lab
 *
 * Instalación en VPS:
 *   npm install -g pm2
 *   pm2 start ecosystem.config.cjs
 *   pm2 startup && pm2 save
 *
 * Deploy inteligente (con rollback automático):
 *   bash scripts/deploy.sh
 */
module.exports = {
  apps: [
    {
      name: 'urpe-brain',
      script: './railway-start.sh',
      interpreter: 'bash',

      // ── Restart policy ────────────────────────────────────────────────────
      // Si crashea en menos de 10s, se considera "crash loop"
      min_uptime: '10s',
      // Máximo 3 reinicios rápidos antes de marcar como "errored" y parar
      max_restarts: 3,
      // Backoff exponencial entre reinicios: 100ms → 200ms → 400ms
      exp_backoff_restart_delay: 100,
      // Una vez marcado "errored", NO reiniciar más (evita bucle infinito)
      autorestart: true,

      // ── Logs ─────────────────────────────────────────────────────────────
      out_file: '/var/log/urpe-brain/out.log',
      error_file: '/var/log/urpe-brain/error.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // ── Env ───────────────────────────────────────────────────────────────
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
