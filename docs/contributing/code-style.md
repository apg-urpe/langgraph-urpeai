# 📐 Estilo de Código

> Convenciones y estándares para Urpe AI Lab

---

## 🎯 Principios

1. **Claridad sobre brevedad**: Código legible > código corto
2. **Consistencia**: Seguir patrones existentes
3. **Type safety**: Evitar `any`, tipar todo
4. **Componentes pequeños**: Una responsabilidad por componente

---

## 📝 TypeScript

### Tipos vs Interfaces
```typescript
// ✅ Interface para objetos
interface Contact {
  id: number;
  nombre: string;
}

// ✅ Type para uniones/utilidades
type ContactStatus = 'activo' | 'pausado' | 'inactivo';
```

### Evitar `any`
```typescript
// ❌ Malo
const data: any = response;

// ✅ Bueno
const data: Contact[] = response;

// ✅ Si es necesario, usar unknown
const data: unknown = externalApi();
if (isContact(data)) {
  // type guard
}
```

### Props Tipadas
```typescript
// ✅ Siempre tipar props
interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export function Button({ label, onClick, disabled = false }: ButtonProps) {
  ...
}
```

---

## ⚛️ React

### Hooks Order
```typescript
function Component() {
  // 1. Estado local
  const [isOpen, setIsOpen] = useState(false);
  
  // 2. Store/context
  const contacts = useContactStore(state => state.contacts);
  
  // 3. Refs
  const inputRef = useRef<HTMLInputElement>(null);
  
  // 4. Effects
  useEffect(() => {}, []);
  
  // 5. Handlers
  const handleClick = useCallback(() => {}, []);
  
  // 6. Render
  return <div>...</div>;
}
```

### Memoización
```typescript
// ✅ Memoizar componentes de lista
const ContactItem = React.memo(({ contact }: Props) => {
  ...
});

// ✅ Memoizar callbacks
const handleDelete = useCallback((id: number) => {
  deleteContact(id);
}, [deleteContact]);

// ✅ Memoizar cálculos costosos
const sortedContacts = useMemo(() => {
  return contacts.sort((a, b) => ...);
}, [contacts]);
```

---

## 🎨 Tailwind CSS

### Orden de Clases
```tsx
// Orden recomendado:
// 1. Layout (flex, grid)
// 2. Tamaño (w, h)
// 3. Espaciado (p, m)
// 4. Fondo/Borde
// 5. Texto
// 6. Estados (hover, focus)
// 7. Animaciones

<div className="
  flex items-center gap-4
  w-full h-12
  px-4 py-2
  bg-zinc-900 border border-zinc-800 rounded-lg
  text-sm text-zinc-100
  hover:bg-zinc-800
  transition-colors
">
```

### Responsive
```tsx
// Mobile-first
<div className="
  p-2 md:p-4 lg:p-6
  text-sm md:text-base
  grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3
">
```

---

## 📦 Imports

### Orden
```typescript
// 1. React/Next
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// 2. Librerías externas
import { format } from 'date-fns';
import { z } from 'zod';

// 3. Componentes internos
import { Button } from '@/components/ui/Button';

// 4. Hooks
import { useContactStore } from '@/store/contactStore';

// 5. Tipos
import type { Contact } from '@/types/contact';

// 6. Utilidades
import { formatPhone } from '@/lib/utils';
```

### Path Aliases
```typescript
// ✅ Usar aliases
import { Button } from '@/components/ui/Button';

// ❌ Evitar paths relativos largos
import { Button } from '../../../components/ui/Button';
```

---

## 🗃️ Zustand Stores

### Estructura
```typescript
interface ContactState {
  // Estado
  contacts: Contact[];
  isLoading: boolean;
  error: string | null;
  
  // Acciones
  fetchContacts: (enterpriseId: number) => Promise<void>;
  updateContact: (id: number, data: Partial<Contact>) => Promise<void>;
}

export const useContactStore = create<ContactState>()((set, get) => ({
  // Estado inicial
  contacts: [],
  isLoading: false,
  error: null,
  
  // Acciones
  fetchContacts: async (enterpriseId) => {
    set({ isLoading: true, error: null });
    try {
      const data = await api.getContacts(enterpriseId);
      set({ contacts: data, isLoading: false });
    } catch (err) {
      set({ error: 'Error al cargar', isLoading: false });
    }
  },
}));
```

### Selectores
```typescript
// ✅ Selectores específicos para evitar re-renders
const contacts = useContactStore(state => state.contacts);
const isLoading = useContactStore(state => state.isLoading);

// ❌ Evitar seleccionar todo el store
const store = useContactStore();
```

---

## 🚫 Anti-Patterns

### Console.logs en Producción
```typescript
// ❌ Malo
console.log('debug:', data);

// ✅ Usar logger condicional o eliminar
if (process.env.NODE_ENV === 'development') {
  console.log('debug:', data);
}
```

### Comentarios Innecesarios
```typescript
// ❌ Comentario obvio
// Incrementar contador
counter++;

// ✅ Comentario útil
// Workaround para bug de Safari con fechas ISO
const date = new Date(isoString.replace('Z', '+00:00'));
```

---

## ✅ Checklist

- [ ] No hay `any` evitables
- [ ] Props tipadas con interface
- [ ] Hooks en orden correcto
- [ ] Imports organizados
- [ ] No hay console.logs de debug
- [ ] Clases Tailwind ordenadas
- [ ] Componentes memoizados si es lista
