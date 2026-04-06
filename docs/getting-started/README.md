# 🚀 Guía de Inicio Rápido

> Instalación y configuración de Urpe AI Lab

---

## 📋 Requisitos Previos

| Requisito | Versión Mínima | Notas |
|-----------|----------------|-------|
| Node.js | 18.x | LTS recomendado |
| npm | 9.x | Incluido con Node.js |
| Git | 2.x | Para clonar el repositorio |
| Cuenta Supabase | - | [supabase.com](https://supabase.com) |
| API Key Gemini | - | [Google AI Studio](https://aistudio.google.com) |

---

## ⚡ Instalación Rápida

### 1. Clonar el Repositorio
```bash
git clone https://github.com/tonyurpe27/Chat-Urpe-AI-LAB-1.1.git
cd Chat-Urpe-AI-LAB-1.1
```

### 2. Instalar Dependencias
```bash
npm install
```

### 3. Configurar Variables de Entorno
```bash
cp .env.example .env.local
```

Edita `.env.local` con tus credenciales:
```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
GEMINI_API_KEY=tu_gemini_api_key
```

### 4. Iniciar Servidor de Desarrollo
```bash
node node_modules/next/dist/bin/next dev
```

Accede a `http://localhost:3000`

---

## 🔧 Configuración de Supabase

### Base de Datos
1. Crear nuevo proyecto en Supabase
2. Ejecutar scripts SQL en orden:
   - `scripts/TAREAS_V2_FULL_DEPLOY.sql`
   - `scripts/GAMIFICATION_SCHEMA.sql`
   - `scripts/CONTACT_PAUSE_SCHEMA.sql`

### Storage Buckets
Crear los siguientes buckets:
- `comprobantes` - Recibos de pago (público)
- `contratos` - Documentos legales (privado)
- `avatars` - Imágenes de perfil (público)
- `chat-uploads` - Archivos del chat (privado)

### Row Level Security (RLS)
Ejecutar `scripts/MULTI_TENANT_RLS.sql` para políticas de seguridad multi-tenant.

---

## 🏗️ Estructura de Comandos

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run start` | Iniciar build de producción |
| `npm run lint` | Verificar código con ESLint |

---

## ✅ Verificación de Instalación

1. **Página de Login**: Debería cargar sin errores
2. **Conexión Supabase**: Verificar en consola del navegador
3. **API Health**: Acceder a `/api/health`

---

## 🔗 Siguientes Pasos

- [Configuración de Variables de Entorno](./environment-setup.md)
- [Arquitectura del Proyecto](../architecture/README.md)
- [Módulos del Sistema](../modules/README.md)
