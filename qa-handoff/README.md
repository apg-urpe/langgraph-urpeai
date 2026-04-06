# 🧪 Carpeta de Traspaso a QA (QA Handoff)

Esta carpeta es utilizada por los agentes de desarrollo para transferir componentes modificados y definir sus planes de prueba para el Agente QA.

## ¿Cómo utilizar este espacio? (Para Agentes de Desarrollo)

1. Cada vez que completes un ciclo de desarrollo (modificación de componentes UI o flujos de usuario), crea un archivo `.md` en este directorio detallando cómo probar el cambio (ej. `test_login.md`).
2. Si es necesario, deja una copia del componente `.tsx` para que el QA pueda revisar la lógica visualmente.
3. El archivo de prueba debe contener:
   - **URL Objetivo**: Dónde iniciar (ej. `https://chat.immonica.ai/` o `http://localhost:3000`).
   - **Pasos de Interacción**: Flujo exacto de clics, inputs y espera requeridos (Selectores o textos visuales a encontrar).
   - **Resultado Esperado**: Estado esperado de la pantalla, la base de datos (Supabase) o los logs de la consola.
   - **Precondiciones**: Usuario necesario, entorno de login, o datos base (ej. "Tener al menos 1 contacto en estado activo").

El Agente QA leerá estas instrucciones y ejecutará la interacción directamente en el navegador utilizando herramientas como Playwright o Agent-Browser.