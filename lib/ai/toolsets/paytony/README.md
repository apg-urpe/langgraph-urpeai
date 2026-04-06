# Paytony: Code Interpretation Module

Modulo de ejecución de código seguro para Monica AI, utilizando **E2B** (Sandboxed Environments).

## Arquitectura
- **Toolset**: `PaytonyToolset`
- **Infrastructure**: E2B Sandboxes (MicroVMs sobre Firecracker)
- **Language**: Python (soporte para librerías de data science: pandas, numpy, matplotlib, etc.)

## Herramientas
- `execute_python`: Ejecuta código Python en un entorno aislado y retorna resultados (texto, imágenes, logs).

## Configuración
Requiere las siguientes variables de entorno:
- `E2B_API_KEY`: API Key de [e2b.dev](https://e2b.dev)
