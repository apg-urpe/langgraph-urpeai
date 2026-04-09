#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Deploy inteligente con health check y rollback automático
#
# Uso (desde /opt/aguapp):
#   bash scripts/deploy.sh [rama]       # default: main
#
# Qué hace:
#   1. Guarda el commit actual como punto de rollback
#   2. git pull de la rama indicada
#   3. docker compose up -d --build  (rebuild + restart del contenedor)
#   4. Espera que el health check de Docker diga "healthy"
#   5. Si queda "unhealthy" → rollback al commit anterior + rebuild + notificación
#   6. Si queda "healthy"  → notificación de éxito
# =============================================================================
set -euo pipefail

BRANCH="${1:-main}"
CONTAINER_NAME="aguapp"
COMPOSE_FILE="docker-compose.yml"
MAX_WAIT=120          # segundos máximos esperando que el contenedor sea healthy
POLL_INTERVAL=5       # segundos entre cada consulta al health check
LOG_FILE="/var/log/aguapp/deploy.log"

# ── Colores ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

log()      { echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }
log_ok()   { log "${GREEN}✓ $*${NC}"; }
log_err()  { log "${RED}✗ $*${NC}"; }
log_warn() { log "${YELLOW}⚠ $*${NC}"; }

mkdir -p "$(dirname "$LOG_FILE")"

# ── Notificación por webhook ───────────────────────────────────────────────────
notify() {
  local msg="$1"
  if [ -f .env ]; then
    export $(grep -s '^ERROR_WEBHOOK_URL=' .env | xargs) 2>/dev/null || true
  fi
  if [ -n "${ERROR_WEBHOOK_URL:-}" ]; then
    curl -sf -X POST "$ERROR_WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"text\": \"$msg\"}" \
      --max-time 5 > /dev/null 2>&1 || true
  fi
  log "$msg"
}

# ── Esperar a que el contenedor sea healthy ───────────────────────────────────
wait_healthy() {
  local elapsed=0
  log "Esperando health check del contenedor (max ${MAX_WAIT}s)..."

  while [ $elapsed -lt $MAX_WAIT ]; do
    local status
    status=$(docker inspect --format='{{.State.Health.Status}}' "$CONTAINER_NAME" 2>/dev/null || echo "not_found")

    case "$status" in
      healthy)
        log_ok "Contenedor healthy después de ${elapsed}s"
        return 0
        ;;
      unhealthy)
        log_err "Contenedor marcado unhealthy después de ${elapsed}s"
        return 1
        ;;
      starting)
        log "  → starting... (${elapsed}s/${MAX_WAIT}s)"
        ;;
      *)
        log_warn "  → estado desconocido: $status (${elapsed}s)"
        ;;
    esac

    sleep $POLL_INTERVAL
    elapsed=$((elapsed + POLL_INTERVAL))
  done

  log_err "Timeout: el contenedor no llegó a healthy en ${MAX_WAIT}s"
  return 1
}

# ── Rebuild y arrancar ────────────────────────────────────────────────────────
rebuild_and_start() {
  log "Haciendo docker compose up -d --build..."
  docker compose -f "$COMPOSE_FILE" up -d --build 2>&1 | tee -a "$LOG_FILE"
}

# ── Rollback ──────────────────────────────────────────────────────────────────
rollback() {
  local bad_commit="$1"
  local good_commit="$2"
  local bad_msg="$3"

  log_err "Rollback: ${bad_commit:0:8} → ${good_commit:0:8}"
  notify "⚠️ *[URPE Brain] Deploy fallido — iniciando rollback*\nCommit roto: \`${bad_commit:0:8}\` — $bad_msg\nVolviendo a: \`${good_commit:0:8}\`..."

  git reset --hard "$good_commit"
  rebuild_and_start

  if wait_healthy; then
    notify "🔄 *[URPE Brain] Rollback exitoso*\nServidor restaurado a \`${good_commit:0:8}\`\nIntervención manual requerida para el commit roto."
    log_ok "Rollback completado — servidor restaurado"
  else
    notify "🚨 *[URPE Brain] ROLLBACK FALLIDO*\nEl servidor no responde ni con el commit anterior.\n⚠️ Intervención manual urgente requerida.\nÚltimo commit bueno: \`${good_commit:0:8}\`"
    log_err "CRÍTICO: rollback fallido — intervención manual requerida"
    exit 2
  fi
}

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

log "════════════════════════════════════════════════════"
log "Deploy iniciado — rama: $BRANCH"
log "════════════════════════════════════════════════════"

# 1. Guardar commit actual como punto de rollback
LAST_GOOD_COMMIT=$(git rev-parse HEAD)
LAST_GOOD_MSG=$(git log -1 --pretty=format:"%s" HEAD)
log "Rollback point: ${LAST_GOOD_COMMIT:0:8} — $LAST_GOOD_MSG"

# 2. Pull
log "git pull origin $BRANCH..."
git pull origin "$BRANCH" 2>&1 | tee -a "$LOG_FILE"

NEW_COMMIT=$(git rev-parse HEAD)
NEW_MSG=$(git log -1 --pretty=format:"%s" HEAD)

if [ "$NEW_COMMIT" = "$LAST_GOOD_COMMIT" ]; then
  log_warn "Sin cambios nuevos en $BRANCH. Nada que deployar."
  exit 0
fi

log "Nuevo commit: ${NEW_COMMIT:0:8} — $NEW_MSG"

# 3. Rebuild y arrancar
rebuild_and_start

# 4. Esperar health check
if wait_healthy; then
  notify "✅ *[URPE Brain] Deploy exitoso*\n\`${NEW_COMMIT:0:8}\` — $NEW_MSG"
  log_ok "Deploy completado exitosamente"
  log_ok "  Anterior: ${LAST_GOOD_COMMIT:0:8} — $LAST_GOOD_MSG"
  log_ok "  Nuevo:    ${NEW_COMMIT:0:8} — $NEW_MSG"
else
  # 5. Rollback automático
  rollback "$NEW_COMMIT" "$LAST_GOOD_COMMIT" "$NEW_MSG"
fi
