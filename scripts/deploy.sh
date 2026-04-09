#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Deploy inteligente con health check y rollback automático
#
# Uso:
#   bash scripts/deploy.sh [rama]       # default: main
#
# Qué hace:
#   1. Guarda el commit actual como punto de rollback
#   2. Hace git pull de la rama indicada
#   3. Reinicia el servidor con PM2
#   4. Espera 20s y verifica que el servidor responde
#   5. Si no responde → rollback al commit anterior + notificación por webhook
#   6. Si responde → notificación de deploy exitoso (opcional)
# =============================================================================
set -euo pipefail

BRANCH="${1:-main}"
APP_NAME="urpe-brain"
HEALTH_URL="http://localhost:3001"          # URL local del bridge
HEALTH_TIMEOUT=20                            # segundos a esperar antes de chequear
HEALTH_RETRIES=3                             # intentos de health check
LOG_FILE="/var/log/urpe-brain/deploy.log"

# ── Colores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()     { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
log_ok()  { log "${GREEN}✓ $*${NC}"; }
log_err() { log "${RED}✗ $*${NC}"; }
log_warn(){ log "${YELLOW}⚠ $*${NC}"; }

# ── Crear directorio de logs si no existe ──────────────────────────────────────
mkdir -p "$(dirname "$LOG_FILE")"

# ── Notificación por webhook (usa ERROR_WEBHOOK_URL del .env) ─────────────────
notify() {
  local msg="$1"
  local color="${2:-#6366f1}"   # morado = info, rojo = error, verde = ok

  # Cargar ERROR_WEBHOOK_URL desde .env si existe
  if [ -f .env ]; then
    export $(grep -s '^ERROR_WEBHOOK_URL=' .env | xargs) 2>/dev/null || true
  fi

  if [ -n "${ERROR_WEBHOOK_URL:-}" ]; then
    curl -sf -X POST "$ERROR_WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"text\": \"$msg\"}" \
      --max-time 5 \
      > /dev/null 2>&1 || true   # nunca fallar por el webhook
  fi

  log "$msg"
}

# ── Health check ───────────────────────────────────────────────────────────────
health_check() {
  local attempt=1
  while [ $attempt -le $HEALTH_RETRIES ]; do
    if curl -sf --max-time 5 "$HEALTH_URL" > /dev/null 2>&1; then
      return 0
    fi
    log_warn "Health check intento $attempt/$HEALTH_RETRIES fallido..."
    sleep 3
    attempt=$((attempt + 1))
  done
  return 1
}

# ── Rollback ───────────────────────────────────────────────────────────────────
rollback() {
  local bad_commit="$1"
  local good_commit="$2"

  log_err "Iniciando rollback: $bad_commit → $good_commit"

  git reset --hard "$good_commit"
  pm2 restart "$APP_NAME" --update-env

  sleep "$HEALTH_TIMEOUT"

  if health_check; then
    notify "🔄 *[URPE Brain] Rollback exitoso*\nCommit malo: \`${bad_commit:0:8}\`\nRestaurado a: \`${good_commit:0:8}\`\nServidor recuperado automáticamente." "#f59e0b"
    log_ok "Rollback completado. Servidor restaurado a $good_commit"
  else
    notify "🚨 *[URPE Brain] ROLLBACK FALLIDO*\nEl servidor no responde ni con el commit anterior.\nIntervención manual requerida.\nCommit actual: \`${good_commit:0:8}\`" "#dc2626"
    log_err "CRÍTICO: rollback fallido — intervención manual requerida"
    exit 1
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

log "════════════════════════════════════════════"
log "Deploy iniciado — rama: $BRANCH"
log "════════════════════════════════════════════"

# 1. Guardar commit actual como punto de rollback
LAST_GOOD_COMMIT=$(git rev-parse HEAD)
LAST_GOOD_MSG=$(git log -1 --pretty=format:"%s" HEAD)
log "Punto de rollback guardado: ${LAST_GOOD_COMMIT:0:8} — $LAST_GOOD_MSG"

# 2. Pull
log "Haciendo git pull origin $BRANCH..."
git pull origin "$BRANCH"

NEW_COMMIT=$(git rev-parse HEAD)
NEW_MSG=$(git log -1 --pretty=format:"%s" HEAD)

if [ "$NEW_COMMIT" = "$LAST_GOOD_COMMIT" ]; then
  log_warn "No hay cambios nuevos en $BRANCH. Nada que deployar."
  exit 0
fi

log "Nuevo commit: ${NEW_COMMIT:0:8} — $NEW_MSG"

# 3. Reiniciar con PM2
log "Reiniciando $APP_NAME con PM2..."
if pm2 restart "$APP_NAME" --update-env 2>/dev/null; then
  log_ok "PM2 reiniciado correctamente"
else
  log_warn "PM2 restart falló — intentando pm2 start..."
  pm2 start ecosystem.config.cjs
fi

# 4. Esperar y hacer health check
log "Esperando ${HEALTH_TIMEOUT}s antes de health check..."
sleep "$HEALTH_TIMEOUT"

if health_check; then
  log_ok "Deploy exitoso ✓"
  log_ok "  Commit anterior: ${LAST_GOOD_COMMIT:0:8}"
  log_ok "  Commit nuevo:    ${NEW_COMMIT:0:8} — $NEW_MSG"
  notify "✅ *[URPE Brain] Deploy exitoso*\n\`${NEW_COMMIT:0:8}\` — $NEW_MSG" "#22c55e"
else
  # 5. Rollback automático
  log_err "Health check fallido después del deploy. Iniciando rollback automático..."
  notify "⚠️ *[URPE Brain] Deploy fallido — rollback automático*\nCommit roto: \`${NEW_COMMIT:0:8}\` — $NEW_MSG\nRolling back a \`${LAST_GOOD_COMMIT:0:8}\`..." "#f59e0b"
  rollback "$NEW_COMMIT" "$LAST_GOOD_COMMIT"
fi
