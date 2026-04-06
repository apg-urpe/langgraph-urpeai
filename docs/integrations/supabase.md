# 🗄️ Integración: Supabase

> Auth, Database, Realtime, Storage

---

## 🎯 Propósito

Supabase es el backend principal de Urpe AI Lab, proporcionando:
- **Autenticación**: Login con email/password y OAuth
- **Base de datos**: PostgreSQL con RLS
- **Realtime**: Suscripciones en tiempo real
- **Storage**: Archivos y multimedia
- **Edge Functions**: Funciones serverless

---

## 🔧 Configuración

### Variables de Entorno
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...
```

### Cliente en Frontend
```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

### Cliente en Server
```typescript
// Para operaciones privilegiadas
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

---

## 🔐 Autenticación

### Flujo PKCE
```typescript
// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password'
});

// Logout
await supabase.auth.signOut();

// Obtener sesión
const { data: { session } } = await supabase.auth.getSession();
```

### OAuth (Google)
```typescript
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback`
  }
});
```

---

## 🛡️ Row Level Security (RLS)

### Función Helper
```sql
CREATE OR REPLACE FUNCTION get_user_empresa_ids()
RETURNS SETOF bigint AS $$
  SELECT empresa_id 
  FROM wp_team_humano 
  WHERE auth_uid = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;
```

### Política Típica
```sql
CREATE POLICY "tenant_isolation" ON wp_contactos
FOR ALL USING (
  empresa_id IN (SELECT get_user_empresa_ids())
);
```

---

## 🔄 Realtime

### Suscripción a Cambios
```typescript
const channel = supabase
  .channel('contacts-changes')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'wp_contactos' },
    (payload) => {
      console.log('Change:', payload);
    }
  )
  .subscribe();

// Cleanup
channel.unsubscribe();
```

---

## 📁 Storage

### Buckets Configurados

| Bucket | Visibilidad | Uso |
|--------|-------------|-----|
| `comprobantes` | Público | Recibos de pago |
| `contratos` | Privado | Documentos legales |
| `avatars` | Público | Fotos de perfil |
| `chat-uploads` | Privado | Archivos del chat |

### Upload
```typescript
const { data, error } = await supabase.storage
  .from('comprobantes')
  .upload(`${serviceId}/${fileName}`, file);
```

### URL Pública
```typescript
const { data } = supabase.storage
  .from('comprobantes')
  .getPublicUrl(path);
```

---

## 📊 Tablas Principales

Ver [Modelo de Datos](../architecture/data-model.md) para esquema completo.

---

## 🔍 Debugging

### Dashboard
Acceder a `https://supabase.com/dashboard/project/[PROJECT_ID]`

### Logs
- Authentication → Logs
- Database → Logs
- Edge Functions → Logs

---

## 📚 Documentación Relacionada

- [Modelo de Datos](../architecture/data-model.md)
- [Seguridad Multi-Tenant](../technical/security/README.md)
- [Documentación Oficial](https://supabase.com/docs)
