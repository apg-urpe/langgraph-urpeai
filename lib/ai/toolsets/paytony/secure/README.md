# Paytony Secure: Nylas Read-Only Proxy

Este sub-módulo contiene la lógica para exponer el SDK de Nylas dentro del Sandbox de E2B de forma segura, previniendo inyecciones que intenten enviar correos.

## Estrategia de Seguridad
Para evitar que un atacante use el SDK de Nylas para enviar correos (Data Exfiltration) tras una inyección de instrucciones, implementamos las siguientes capas:

1. **Proxy Inyectado**: En lugar de pasar la `NYLAS_API_KEY` real al entorno de Python, inyectamos un objeto "mock" o un cliente pre-configurado que sobreescribe los métodos de envío (`messages.send`, `drafts.create`, etc.) con funciones que lanzan excepciones.
2. **Restricción de Red (E2B)**: Configuramos el Sandbox de E2B para que solo pueda comunicarse con los endpoints de lectura de Nylas si es posible, o bloqueamos el tráfico saliente general si no es necesario.
3. **Validación de Código**: El orquestador puede realizar un análisis estático simple (regex) buscando palabras prohibidas como `.send(`, `.create(`, `requests.post` antes de enviar el código al Sandbox.

## Implementación
El archivo `nylas-proxy.py` se carga al inicio de cada sesión de Paytony que requiera acceso a correos.
