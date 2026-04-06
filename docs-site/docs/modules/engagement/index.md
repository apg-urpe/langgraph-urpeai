---
title: "Sistema de Engagement y Adopcion"
---

# Engagement y Adopcion

> Seguimiento del uso de la plataforma para entender patrones de adopcion del equipo

---

## Proposito

El sistema de engagement permite a administradores y supervisores entender como el equipo utiliza la plataforma:

- Que modulos visitan con mayor frecuencia
- Que funcionalidades utilizan activamente
- Cuanto tiempo pasan en la aplicacion
- Patrones de retencion y adopcion de nuevas funciones

---

## Metricas Disponibles

### KPIs de Retencion

| Metrica | Descripcion |
|---------|-------------|
| **DAU** | Usuarios activos diarios |
| **WAU** | Usuarios activos en los ultimos 7 dias |
| **MAU** | Usuarios activos en los ultimos 30 dias |
| **Tasa de Retencion** | Porcentaje de usuarios que volvieron vs la semana anterior |
| **Sesiones por Usuario** | Promedio de sesiones por usuario activo |
| **Modulos por Usuario** | Promedio de modulos distintos utilizados |

### Uso por Modulo

- Usuarios unicos que acceden a cada modulo
- Total de vistas y acciones realizadas
- Porcentaje de adopcion: usuarios del modulo vs usuarios totales de la empresa

### Top Funcionalidades

- Ranking de las funcionalidades mas utilizadas
- Conteo de uso por funcionalidad

### Tendencias

- Eventos diarios en el tiempo
- Usuarios unicos diarios
- Sesiones diarias

---

## Dashboard de Engagement

El dashboard de engagement esta disponible en la seccion de **Observabilidad** del Panel de Administracion. Incluye las siguientes secciones:

1. **KPIs de Retencion** - Tarjetas con DAU, WAU, MAU y tasa de retencion
2. **Uso por Modulo** - Barras de progreso mostrando adopcion por modulo
3. **Top Funcionalidades** - Ranking de las funciones mas usadas del equipo
4. **Tendencia de Uso** - Grafico de barras con actividad diaria

---

## Como Funciona el Tracking

El sistema registra automaticamente las interacciones de los usuarios con la plataforma:

- **Vistas de pagina**: Cada vez que un usuario accede a un modulo
- **Acciones**: Cuando un usuario realiza una operacion (crear contacto, enviar mensaje, etc.)
- **Uso de funcionalidades**: Cuando se utiliza una funcion especifica (subir archivo, analisis IA, etc.)
- **Sesiones**: Inicio y fin de cada sesion de uso

### Gestion de Sesiones

- Una sesion expira despues de 30 minutos de inactividad
- Se crea automaticamente una nueva sesion al volver
- Los eventos duplicados dentro de 500ms se ignoran para evitar registros innecesarios

---

## Seguridad y Privacidad

- Cada usuario solo puede ver sus propios datos de actividad
- Los supervisores ven estadisticas agregadas de su empresa, no datos individuales detallados
- El tracking es anonimo a nivel de actividad y se enfoca en patrones de uso, no en contenido

---

## Documentacion Relacionada

- [Observabilidad](/technical/observability/)
- [Equipo](../team/)
