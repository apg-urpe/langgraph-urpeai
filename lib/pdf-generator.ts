// Client-side PDF generation using html2pdf.js
// This avoids all serverless/Puppeteer issues

import { InvoiceTemplateData, generateInvoiceHTML } from './invoice-template';

interface PDFGenerationResult {
  blob: Blob;
  dataUrl: string;
}

/**
 * Convert an external image URL to a base64 data URL.
 * This is critical for html2canvas which cannot render cross-origin images.
 */
async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    if (!url || url.startsWith('data:')) return url;
    
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) return null;
    
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn('[PDF] Could not convert logo to base64:', err);
    return null;
  }
}

/**
 * Generate PDF from invoice data (client-side)
 */
export async function generateInvoicePDFClient(
  templateData: InvoiceTemplateData
): Promise<PDFGenerationResult> {
  // Dynamic import to avoid SSR issues
  const html2pdf = (await import('html2pdf.js')).default;

  // Pre-convert logo to base64 to avoid CORS issues with html2canvas
  const enrichedData = { ...templateData };
  if (templateData.empresa.logoUrl && !templateData._logoBase64) {
    const base64Logo = await imageUrlToBase64(templateData.empresa.logoUrl);
    if (base64Logo) {
      enrichedData._logoBase64 = base64Logo;
    }
  }

  const html = generateInvoiceHTML(enrichedData);

  // Build a render-safe DOM tree from full HTML document string
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const container = document.createElement('div');

  // Keep it on-screen coordinates (avoid off-screen crop bugs).
  // NOTE: html2canvas can render blank if element is hidden or behind body stacking.
  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '794px'; // A4 width at 96 DPI
  container.style.minHeight = '1123px';
  container.style.background = '#ffffff';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '2147483647';

  // Inject <style> tags from generated HTML head
  const styleTags = Array.from(parsed.querySelectorAll('style'));
  for (const styleTag of styleTags) {
    const clonedStyle = document.createElement('style');
    clonedStyle.textContent = styleTag.textContent;
    container.appendChild(clonedStyle);
  }

  // Inject only the body content (not nested html/head/body tags)
  const bodyWrapper = document.createElement('div');
  bodyWrapper.innerHTML = parsed.body.innerHTML;
  container.appendChild(bodyWrapper);
  document.body.appendChild(container);

  // Prefer rendering the invoice root to avoid wrong bounding boxes
  const renderElement = (container.querySelector('.page') as HTMLElement | null) || bodyWrapper;
  renderElement.style.background = '#ffffff';

  // Wait for fonts and images to fully load
  if ('fonts' in document && document.fonts?.ready) {
    await document.fonts.ready;
  }

  const images = renderElement.querySelectorAll('img');
  const imagePromises = Array.from(images).map(img => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      setTimeout(resolve, 3000);
    });
  });

  await Promise.all(imagePromises);

  // Extended delay to ensure complete rendering (fonts, layout, images)
  await new Promise(resolve => setTimeout(resolve, 500));

  const renderWidth = renderElement.scrollWidth || 794;
  const renderHeight = renderElement.scrollHeight || 1123;

  const options = {
    margin: 0,
    filename: `${templateData.numeroFactura}.pdf`,
    image: { type: 'jpeg' as const, quality: 0.95 },
    html2canvas: { 
      scale: 2,
      useCORS: true,
      allowTaint: false,
      letterRendering: true,
      logging: false,
      windowWidth: renderWidth,
      windowHeight: renderHeight,
      width: renderWidth,
      height: renderHeight,
      backgroundColor: '#ffffff'
    },
    jsPDF: { 
      unit: 'mm' as const, 
      format: 'a4' as const, 
      orientation: 'portrait' as const,
      compress: true
    }
  };

  try {
    console.log('[PDF] Starting PDF generation...');
    console.log('[PDF] Render width:', renderWidth);
    console.log('[PDF] Render height:', renderHeight);
    console.log('[PDF] Items count:', templateData.items.length);
    
    // Generate PDF blob from the invoice root element
    let pdfBlob: Blob = await html2pdf()
      .set(options)
      .from(renderElement)
      .outputPdf('blob');

    console.log('[PDF] PDF generated, size:', pdfBlob.size, 'bytes');
    
    if (pdfBlob.size < 1000) {
      console.warn('[PDF] Blob demasiado pequeño, reintentando con fallback...');

      const fallbackOptions = {
        margin: 10,
        filename: `${templateData.numeroFactura}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: {
          scale: 1,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff'
        },
        jsPDF: {
          unit: 'mm' as const,
          format: 'a4' as const,
          orientation: 'portrait' as const
        }
      };

      pdfBlob = await html2pdf()
        .set(fallbackOptions)
        .from(renderElement)
        .outputPdf('blob');

      console.log('[PDF] Fallback PDF size:', pdfBlob.size, 'bytes');

      if (pdfBlob.size < 1000) {
        throw new Error('PDF generado está vacío después de reintento.');
      }
    }

    // Also get data URL for preview
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(pdfBlob);
    });

    console.log('[PDF] PDF generation successful');
    return { blob: pdfBlob, dataUrl };
  } catch (error: any) {
    console.error('[PDF] Generation error:', error);
    throw new Error(`Error generando PDF: ${error.message}`);
  } finally {
    // Cleanup
    document.body.removeChild(container);
  }
}

/**
 * Download PDF directly in browser
 */
export function downloadPDF(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Upload PDF blob to Supabase Storage
 */
export async function uploadPDFToStorage(
  blob: Blob,
  filePath: string,
  supabaseClient: any
): Promise<string | null> {
  try {
    console.log('[PDF] Starting upload to path:', filePath);
    
    const { error: uploadError } = await supabaseClient.storage
      .from('facturas')
      .upload(filePath, blob, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error('[PDF] Upload error details:', uploadError);
      
      // Try to create bucket if it doesn't exist
      if (uploadError.message?.includes('not found') || uploadError.message?.includes('Bucket')) {
        console.log('[PDF] Bucket not found, attempting to create...');
        
        try {
          const { error: bucketError } = await supabaseClient.storage.createBucket('facturas', {
            public: true,
            fileSizeLimit: 10485760
          });
          
          if (bucketError) {
            console.error('[PDF] Bucket creation failed:', bucketError);
            throw new Error(`No se pudo crear el bucket 'facturas': ${bucketError.message}`);
          }
          
          console.log('[PDF] Bucket created, retrying upload...');
          
          // Retry upload
          const { error: retryError } = await supabaseClient.storage
            .from('facturas')
            .upload(filePath, blob, {
              contentType: 'application/pdf',
              upsert: true
            });
            
          if (retryError) {
            console.error('[PDF] Retry upload failed:', retryError);
            throw retryError;
          }
        } catch (bucketCreateError: any) {
          console.error('[PDF] Bucket creation error:', bucketCreateError);
          throw new Error(`
❌ Error: El bucket 'facturas' no existe y no se pudo crear automáticamente.

Por favor, crea el bucket manualmente en Supabase Dashboard:
1. Ve a Storage > New Bucket
2. Nombre: "facturas"
3. Marca "Public bucket" como SÍ
4. Guarda

O ejecuta el script: scripts/STORAGE_FACTURAS_BUCKET.sql
          `);
        }
      } else if (uploadError.message?.includes('row-level security') || uploadError.message?.includes('RLS')) {
        throw new Error(`
❌ Error de permisos (RLS): No tienes permiso para subir archivos.

Por favor, configura las políticas RLS en Supabase Dashboard:
1. Ve a Storage > facturas > Policies
2. Crea una política INSERT para authenticated users
3. Usa TRUE como definición de política

O ejecuta el script: scripts/STORAGE_FACTURAS_BUCKET.sql
        `);
      } else {
        throw uploadError;
      }
    }

    // Get public URL
    const { data: { publicUrl } } = supabaseClient.storage
      .from('facturas')
      .getPublicUrl(filePath);

    console.log('[PDF] Upload successful, URL:', publicUrl);
    return publicUrl;
  } catch (error: any) {
    console.error('[PDF] Upload error:', error);
    // Re-throw the error with detailed message for the UI
    throw error;
  }
}
