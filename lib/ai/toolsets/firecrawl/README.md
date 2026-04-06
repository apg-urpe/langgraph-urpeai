# Firecrawl Toolset

Tools para web scraping y búsqueda en internet usando **Firecrawl API**.

## Requisitos

- `FIRECRAWL_API_KEY` en `.env`

## Tools Disponibles

### `web_search` - Búsqueda en Internet
Busca información en la web con opción de extraer contenido.

```typescript
// Búsqueda simple
web_search({ query: "mejores prácticas CRM 2024" })

// Búsqueda con scraping de resultados
web_search({ 
  query: "competidores de Urpe AI Lab",
  limit: 5,
  scrapeResults: true  // Extrae contenido completo
})
```

### `web_scrape` - Scraping de URL
Extrae el contenido de una página web específica.

```typescript
// Extraer contenido de una URL
web_scrape({ url: "https://example.com/about" })

// Con opciones
web_scrape({ 
  url: "https://blog.example.com/article",
  onlyMainContent: true,
  includeLinks: true
})
```

## Integración

Las tools se añaden automáticamente al chat de Monica si `FIRECRAWL_API_KEY` está configurada.

## API Reference

- **Firecrawl API**: https://api.firecrawl.dev/v1
- **Docs**: https://docs.firecrawl.dev

## Rate Limits

- Las tools manejan automáticamente errores 429 (rate limit)
- Contenido truncado a 15,000 caracteres para scrape
- Contenido truncado a 3,000 caracteres por resultado en search

## Créditos

Cada operación consume créditos de Firecrawl:
- `scrape`: ~1-2 créditos
- `search`: ~1 crédito por resultado
