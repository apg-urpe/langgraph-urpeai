// Client-side PDF generation for Redacción documents
// Follows the same pattern as lib/pdf-generator.ts (invoices)

import { RedaccionTemplateData, generateRedaccionHTML } from './redaccion-template';

interface PDFGenerationResult {
  blob: Blob;
  dataUrl: string;
}

/**
 * Convert an external image URL to a base64 data URL.
 * Critical for html2canvas which cannot render cross-origin images.
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
    console.warn('[RedaccionPDF] Could not convert logo to base64:', err);
    return null;
  }
}

/**
 * Generate PDF from Redacción document data (client-side).
 * Uses html2pdf.js (already installed) — same approach as invoice PDFs.
 */
export async function generateRedaccionPDFClient(
  templateData: RedaccionTemplateData
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

  const html = generateRedaccionHTML(enrichedData);

  // Build a render-safe DOM tree from full HTML document string
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const container = document.createElement('div');

  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '816px'; // Letter width at 96 DPI
  container.style.minHeight = '1056px';
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

  // Inject only the body content
  const bodyWrapper = document.createElement('div');
  bodyWrapper.innerHTML = parsed.body.innerHTML;
  container.appendChild(bodyWrapper);
  document.body.appendChild(container);

  // Prefer rendering the document root to avoid wrong bounding boxes
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

  // Extended delay for complete rendering
  await new Promise(resolve => setTimeout(resolve, 500));

  const renderWidth = renderElement.scrollWidth || 816;
  const renderHeight = renderElement.scrollHeight || 1056;

  const options = {
    margin: 0,
    filename: `${templateData.documento.nombre.replace(/[^a-zA-Z0-9\s-_áéíóúñÁÉÍÓÚÑ]/g, '').substring(0, 60)}.pdf`,
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
      backgroundColor: '#ffffff',
    },
    jsPDF: {
      unit: 'mm' as const,
      format: 'letter' as const,
      orientation: 'portrait' as const,
      compress: true,
    },
  };

  try {
    console.log('[RedaccionPDF] Starting PDF generation...');
    console.log('[RedaccionPDF] Render size:', renderWidth, 'x', renderHeight);
    console.log('[RedaccionPDF] Sections:', templateData.secciones.length);

    let pdfBlob: Blob = await html2pdf()
      .set(options)
      .from(renderElement)
      .outputPdf('blob');

    console.log('[RedaccionPDF] PDF generated, size:', pdfBlob.size, 'bytes');

    if (pdfBlob.size < 1000) {
      console.warn('[RedaccionPDF] Blob too small, retrying with fallback...');

      const fallbackOptions = {
        margin: 10,
        filename: options.filename,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: {
          scale: 1,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
        },
        jsPDF: {
          unit: 'mm' as const,
          format: 'letter' as const,
          orientation: 'portrait' as const,
        },
      };

      pdfBlob = await html2pdf()
        .set(fallbackOptions)
        .from(renderElement)
        .outputPdf('blob');

      console.log('[RedaccionPDF] Fallback PDF size:', pdfBlob.size, 'bytes');

      if (pdfBlob.size < 1000) {
        throw new Error('PDF generado está vacío después de reintento.');
      }
    }

    // Get data URL for preview
    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(pdfBlob);
    });

    console.log('[RedaccionPDF] PDF generation successful');
    return { blob: pdfBlob, dataUrl };
  } catch (error: any) {
    console.error('[RedaccionPDF] Generation error:', error);
    throw new Error(`Error generando PDF: ${error.message}`);
  } finally {
    document.body.removeChild(container);
  }
}

/**
 * Download PDF directly in browser
 */
export function downloadRedaccionPDF(blob: Blob, filename: string): void {
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
 * Upload Redacción PDF to Supabase Storage
 */
export async function uploadRedaccionPDFToStorage(
  blob: Blob,
  filePath: string,
  supabaseClient: any
): Promise<string | null> {
  try {
    console.log('[RedaccionPDF] Uploading to:', filePath);

    const { error: uploadError } = await supabaseClient.storage
      .from('redacciones')
      .upload(filePath, blob, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (uploadError) {
      console.error('[RedaccionPDF] Upload error:', uploadError);

      if (uploadError.message?.includes('not found') || uploadError.message?.includes('Bucket')) {
        // Try creating the bucket
        const { error: bucketError } = await supabaseClient.storage.createBucket('redacciones', {
          public: true,
          fileSizeLimit: 10485760,
        });

        if (bucketError) {
          throw new Error(`No se pudo crear el bucket 'redacciones': ${bucketError.message}`);
        }

        // Retry upload
        const { error: retryError } = await supabaseClient.storage
          .from('redacciones')
          .upload(filePath, blob, {
            contentType: 'application/pdf',
            upsert: true,
          });

        if (retryError) throw retryError;
      } else {
        throw uploadError;
      }
    }

    const { data: { publicUrl } } = supabaseClient.storage
      .from('redacciones')
      .getPublicUrl(filePath);

    console.log('[RedaccionPDF] Upload successful:', publicUrl);
    return publicUrl;
  } catch (error: any) {
    console.error('[RedaccionPDF] Upload error:', error);
    throw error;
  }
}
