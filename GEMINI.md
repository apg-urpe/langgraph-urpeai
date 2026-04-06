# Reglas de Trabajo: Chat Urpe AI Lab

Este documento establece las políticas operativas del proyecto para cualquier agente de inteligencia artificial involucrado. 

## Flujo de QA y Testing Automático (Traspaso)
Para garantizar la calidad de la interfaz y la experiencia del usuario (UI/UX) sin romper los flujos existentes de producción, utilizaremos un sistema de QA de rol separado:

- **Rol del Agente de Desarrollo:** Cuando modifiques o crees un nuevo componente que tenga impacto visual o funcional, **NO** asumas que funciona perfectamente. 
  1. Copia el componente o un resumen de sus dependencias en la carpeta `qa-handoff/`.
  2. Crea un documento de instrucciones de testeo dentro de `qa-handoff/` (ej. `test_login_component.md`) explicando qué probar.
  3. Instruye al usuario para que invoque al Agente QA.

- **Rol del Agente QA (Tester):** Cuando se asigne el rol de Tester o el usuario solicite un QA, se debe activar la habilidad de testeo (`qa-tester`).
  1. El Agente QA debe leer los archivos de la carpeta `qa-handoff/`.
  2. Debe lanzar herramientas de automatización de navegador (Playwright o `agent-browser`).
  3. Navegar a `https://chat.immonica.ai/` (o al entorno de desarrollo local).
  4. Ejecutar estrictamente el escenario planteado.
  5. Proveer un reporte final claro con los pasos que funcionaron (✅) y los que fallaron (❌), sin tratar de modificar directamente el código fuente (sólo entregar el diagnóstico a desarrollo).