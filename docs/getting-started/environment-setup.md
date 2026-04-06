# 🔐 Configuración de Variables de Entorno

> Guía completa de credenciales y configuración

---

## 📋 Variables Requeridas

### Supabase (Obligatorias)

```env
# URL del proyecto Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co

# Key pública para cliente (expuesta al navegador)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Key privada para operaciones server-side (NUNCA exponer)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Dónde obtenerlas:**
1. Ir a [Supabase Dashboard](https://supabase.com/dashboard)
2. Seleccionar proyecto → Settings → API
3. Copiar `URL`, `anon key` y `service_role key`

---

### Gemini AI (Obligatoria)

```env
# API Key de Google Gemini
GEMINI_API_KEY=AIzaSy...
```

**Dónde obtenerla:**
1. Ir a [Google AI Studio](https://aistudio.google.com)
2. Click en "Get API Key"
3. Crear nueva key o usar existente

---

## 📋 Variables Opcionales

### Nylas (Calendario/Email)

```env
NYLAS_CLIENT_ID=tu_client_id
NYLAS_API_KEY=tu_api_key
NYLAS_API_URI=https://api.us.nylas.com
```

### n8n (Legacy Webhooks)

```env
N8N_WEBHOOK_URL=https://tu-n8n.app.n8n.cloud/webhook/xxx
X_URPE_AUTH=urpe-secure-chat-2024
```

---

## 🔒 Seguridad

### ⚠️ Reglas Importantes

1. **NUNCA** commitear `.env.local` al repositorio
2. **NUNCA** exponer `SUPABASE_SERVICE_ROLE_KEY` en el cliente
3. Variables `NEXT_PUBLIC_*` son visibles en el navegador
4. Rotar keys regularmente en producción

### Archivo `.gitignore`
Verificar que incluya:
```gitignore
.env
.env.local
.env.*.local
```

---

## 🌐 Configuración por Entorno

### Desarrollo Local
```env
NODE_ENV=development
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Producción (Vercel)
Configurar en Dashboard de Vercel → Settings → Environment Variables

---

## ✅ Verificación

Ejecutar el servidor y verificar en consola:
```bash
node node_modules/next/dist/bin/next dev
```

Debería conectar sin errores a:
- ✅ Supabase Auth
- ✅ Supabase Database
- ✅ Gemini API (en primer mensaje del chat)
