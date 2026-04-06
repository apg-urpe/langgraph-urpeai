---
title: "Revisión de archivos monolíticos"
---

## Objetivo

Dejar registro de una revisión técnica para identificar archivos demasiado grandes o con demasiadas responsabilidades, con el fin de planificar su modularización sin afectar el comportamiento actual del sistema.

## Alcance inicial

Esta revisión se enfocará primero en archivos con más de 800 líneas, priorizando:

- rutas API extensas
- stores con múltiples responsabilidades
- vistas o componentes con lógica de UI, estado y acceso a datos mezclados
- utilidades centrales con demasiadas funciones agrupadas
- documentos duplicados o excesivamente extensos cuando afecten mantenimiento

## Criterios de evaluación

Durante la revisión se buscará detectar:

- múltiples responsabilidades dentro de un mismo archivo
- dificultad para testear o reutilizar partes del código
- imports excesivos o dependencias cruzadas
- lógica de negocio mezclada con presentación
- crecimiento histórico sin separación por dominio

## Resultado esperado

Como siguiente paso, se generará una propuesta de refactorización gradual que incluya:

- archivos candidatos a dividir
- criterio de partición por dominio o responsabilidad
- riesgos técnicos
- orden recomendado de intervención

## Nota

Este documento solo deja constancia de la revisión en curso. Por ahora no implica cambios de implementación.
