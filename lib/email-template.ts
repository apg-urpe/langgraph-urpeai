/**
 * Email HTML Template Builder
 * 
 * Genera emails HTML profesionales compatibles con Gmail, Outlook y Apple Mail.
 * Usa table-based layout con inline styles para máxima compatibilidad.
 * 
 * Basado en la plantilla corporativa Urpe AI Lab.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface EmailSection {
  type: 'header' | 'greeting' | 'paragraph' | 'status_box' | 'details_box' | 'button' | 'checklist' | 'quote' | 'info_box' | 'steps' | 'closing';
  title?: string;
  subtitle?: string;
  text?: string;
  status?: string;
  message?: string;
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'info' | 'example';
  url?: string;
  items?: Array<string | { label: string; value: string }>;
  author?: string;
}

export interface EmailData {
  subject: string;
  sections: EmailSection[];
}

export interface EmailContext {
  contactName: string;
  contactEmail: string;
  enterpriseName: string;
  enterpriseColor?: string;       // hex, default #0D1B2A
  advisorName: string;
  advisorEmail: string;
  unsubscribeUrl?: string;
  whatsappNumber?: string;
}

// ============================================================================
// COLOR CONSTANTS
// ============================================================================

const DEFAULT_PRIMARY = '#0D1B2A';
const ACCENT_BLUE = '#60A5FA';
const SUCCESS_GREEN = '#10B981';
const SUCCESS_BG = '#ECFDF5';
const SUCCESS_TEXT = '#065F46';
const SUCCESS_DARK = '#047857';
const WARNING_AMBER = '#F59E0B';
const WARNING_BG = '#FFFBEB';
const WARNING_TEXT = '#92400E';
const INFO_BG = '#EFF6FF';
const INFO_BORDER = '#60A5FA';
const INFO_TEXT = '#1E40AF';
const LIGHT_BG = '#F8FAFC';
const BORDER_COLOR = '#e5e7eb';
const TEXT_DARK = '#0D1B2A';
const TEXT_BODY = '#1a1a1a';
const TEXT_SECONDARY = '#1B263B';
const TEXT_MUTED = '#64748B';
const TEXT_SUBTLE = '#94a3b8';

// ============================================================================
// SECTION RENDERERS
// ============================================================================

function renderHeader(section: EmailSection, primaryColor: string): string {
  return `
  <tr>
    <td align="center" bgcolor="${primaryColor}" style="background-color: ${primaryColor}; padding: 56px 44px; border-radius: 16px 16px 0 0;" class="mobile-padding">
      <p style="font-family: 'Inter', Arial, Helvetica, sans-serif; font-size: 28px; font-weight: 700; color: #ffffff; margin: 0 0 12px 0; line-height: 1.2; letter-spacing: -0.5px;" class="mobile-h1">
        <span style="color: #ffffff;">${escapeHtml(section.title || '')}</span>
      </p>
      ${section.subtitle ? `
      <p style="font-family: 'Inter', Arial, Helvetica, sans-serif; color: #BFDBFE; font-size: 15px; margin: 0; font-weight: 600; letter-spacing: 0.2px;">
        <span style="color: #BFDBFE;">${escapeHtml(section.subtitle)}</span>
      </p>` : ''}
    </td>
  </tr>`;
}

function renderGreeting(section: EmailSection): string {
  const text = (section.text || '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  return `
  <tr>
    <td align="left" style="padding: 36px 44px 18px 44px; color: ${TEXT_DARK}; font-family: 'Inter', Arial, Helvetica, sans-serif; font-size: 17px; line-height: 1.6;" class="mobile-padding">
      <p style="margin: 0; font-size: 17px; color: ${TEXT_DARK};">
        ${text}
      </p>
    </td>
  </tr>`;
}

function renderParagraph(section: EmailSection): string {
  const text = (section.text || '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');
  return `
  <tr>
    <td align="left" style="padding: 0 44px 22px 44px; color: ${TEXT_BODY}; font-family: 'Inter', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.7;" class="mobile-padding">
      <p style="margin: 0; font-size: 16px; color: ${TEXT_BODY};">
        ${text}
      </p>
    </td>
  </tr>`;
}

function renderStatusBox(section: EmailSection): string {
  const variant = section.variant || 'success';
  const configs: Record<string, { bg: string; border: string; labelColor: string; textColor: string; icon: string; iconBg: string }> = {
    success: { bg: SUCCESS_BG, border: SUCCESS_GREEN, labelColor: SUCCESS_TEXT, textColor: SUCCESS_DARK, icon: '✓', iconBg: SUCCESS_GREEN },
    warning: { bg: WARNING_BG, border: WARNING_AMBER, labelColor: WARNING_TEXT, textColor: '#B45309', icon: '!', iconBg: WARNING_AMBER },
    info: { bg: INFO_BG, border: INFO_BORDER, labelColor: INFO_TEXT, textColor: '#1D4ED8', icon: 'i', iconBg: INFO_BORDER },
  };
  const c = configs[variant] || configs.success;

  return `
  <tr>
    <td style="padding: 0 44px 28px 44px;" class="mobile-padding">
      <table border="0" cellspacing="0" cellpadding="0" width="100%" style="background: ${c.bg}; background-color: ${c.bg}; border-radius: 14px; border-left: 6px solid ${c.border};">
        <tr>
          <td style="padding: 26px 30px;">
            <table border="0" cellspacing="0" cellpadding="0" width="100%">
              <tr>
                <td width="40" valign="top">
                  <table border="0" cellspacing="0" cellpadding="0">
                    <tr>
                      <td style="background-color: ${c.iconBg}; width: 32px; height: 32px; border-radius: 50%; text-align: center; vertical-align: middle;">
                        <span style="color: #ffffff; font-size: 20px; font-weight: bold; line-height: 32px;">${c.icon}</span>
                      </td>
                    </tr>
                  </table>
                </td>
                <td style="padding-left: 16px;">
                  <p style="margin: 0 0 6px 0; font-size: 14px; color: ${c.labelColor}; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                    ${escapeHtml(section.status || 'ESTADO')}
                  </p>
                  <p style="margin: 0; font-size: 17px; color: ${c.textColor}; font-weight: 600; line-height: 1.4;" class="status-bar-text">
                    ${escapeHtml(section.message || section.text || '')}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderDetailsBox(section: EmailSection, primaryColor: string): string {
  const items = (section.items || []) as Array<{ label: string; value: string }>;
  const rows = items.map((item, index) => {
    const isStatus = item.value && item.value.toUpperCase() === item.value && item.value.length < 20;
    const valueHtml = isStatus
      ? `<span style="background-color: ${primaryColor}; color: #ffffff; padding: 4px 12px; border-radius: 20px; font-size: 14px; font-weight: 600;">${escapeHtml(item.value)}</span>`
      : `<span style="color: #0F172A; font-weight: 700;">${escapeHtml(item.value)}</span>`;
    const borderStyle = index === 0 ? '' : `border-top: 1px solid ${BORDER_COLOR};`;
    return `
      <tr>
        <td style="padding: 14px 0; color: ${TEXT_MUTED}; font-weight: 600; width: 38%; ${borderStyle}">${escapeHtml(item.label)}</td>
        <td align="right" style="padding: 14px 0 14px 16px; ${borderStyle}">${valueHtml}</td>
      </tr>`;
  }).join('');

  return `
  <tr>
    <td style="padding: 0 44px 28px 44px;" class="mobile-padding">
      <table border="0" cellspacing="0" cellpadding="0" width="100%" style="background-color: #FFFFFF; border-radius: 14px; border: 1px solid #E2E8F0;">
        <tr>
          <td style="padding: 26px 28px;">
            ${section.title ? `
            <p style="font-family: 'Inter', Arial, Helvetica, sans-serif; font-size: 19px; font-weight: 700; color: ${TEXT_DARK}; margin: 0 0 18px 0;">
              <span style="color: ${TEXT_DARK};">${escapeHtml(section.title)}</span>
            </p>` : ''}
            <table border="0" cellspacing="0" cellpadding="0" width="100%">
              ${rows}
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderButton(section: EmailSection, primaryColor: string): string {
  const variant = section.variant || 'primary';
  const bgColor = variant === 'secondary' ? ACCENT_BLUE : primaryColor;
  const fontSize = variant === 'secondary' ? '16px' : '17px';
  const padding = variant === 'secondary' ? '16px 28px' : '17px 30px';

  return `
  <tr>
    <td align="center" style="padding: 0 44px 28px 44px;" class="mobile-padding">
      <table border="0" cellspacing="0" cellpadding="0" width="100%">
        <tr>
          <td align="center" bgcolor="${bgColor}">
            <a href="${escapeHtml(section.url || '#')}" target="_blank" style="display: block; background: ${bgColor}; color: #ffffff; font-family: 'Inter', Arial, Helvetica, sans-serif; font-size: ${fontSize}; font-weight: 700; text-decoration: none; padding: ${padding}; border-radius: 12px; text-align: center;" class="button-link">
              ${escapeHtml(section.text || 'Click aquí')}
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderChecklist(section: EmailSection): string {
  const items = (section.items || []) as string[];
  const rows = items.map(item => `
    <tr>
      <td style="padding: 6px 0; color: ${TEXT_BODY}; font-size: 15px;">
        <span style="color: ${SUCCESS_GREEN}; font-weight: bold; margin-right: 8px; font-size: 16px;">✓</span>${escapeHtml(item)}
      </td>
    </tr>`).join('');

  return `
  <tr>
    <td style="padding: 0 40px 30px 40px;" class="mobile-padding">
      ${section.title ? `
      <p style="font-family: 'Inter', Arial, Helvetica, sans-serif; font-size: 22px; font-weight: 600; color: ${TEXT_DARK}; margin: 0 0 20px 0; padding-bottom: 12px; border-bottom: 3px solid ${ACCENT_BLUE};" class="mobile-h2">
        <span style="color: ${TEXT_DARK};">${escapeHtml(section.title)}</span>
      </p>` : ''}
      <table border="0" cellspacing="0" cellpadding="0" width="100%">
        ${rows}
      </table>
    </td>
  </tr>`;
}

function renderQuote(section: EmailSection, primaryColor: string): string {
  return `
  <tr>
    <td style="padding: 0 40px 30px 40px;" class="mobile-padding">
      <table border="0" cellspacing="0" cellpadding="0" width="100%" bgcolor="${primaryColor}" style="background-color: ${primaryColor}; border-radius: 8px;">
        <tr>
          <td style="padding: 28px; text-align: center;">
            <p style="margin: 0 0 12px 0; color: #ffffff; font-size: 17px; font-style: italic; line-height: 1.5;">
              "${escapeHtml(section.text || '')}"
            </p>
            ${section.author ? `
            <p style="margin: 0; color: ${ACCENT_BLUE}; font-size: 18px; font-weight: 600;">
              — ${escapeHtml(section.author)}
            </p>` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderInfoBox(section: EmailSection): string {
  const variant = section.variant || 'info';
  const configs: Record<string, { bg: string; border: string; titleColor: string }> = {
    info: { bg: INFO_BG, border: INFO_BORDER, titleColor: INFO_TEXT },
    example: { bg: INFO_BG, border: INFO_BORDER, titleColor: INFO_TEXT },
    warning: { bg: WARNING_BG, border: WARNING_AMBER, titleColor: WARNING_TEXT },
  };
  const c = configs[variant] || configs.info;
  const text = (section.text || '').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br/>');

  return `
  <tr>
    <td style="padding: 0 44px 28px 44px;" class="mobile-padding">
      <table border="0" cellspacing="0" cellpadding="0" width="100%" style="background-color: ${c.bg}; border-left: 4px solid ${c.border}; border-radius: 12px;">
        <tr>
          <td style="padding: 22px 24px;">
            ${section.title ? `
            <p style="margin: 0 0 10px 0; font-weight: 600; color: ${c.titleColor}; font-size: 15px;">
              ${escapeHtml(section.title)}
            </p>` : ''}
            <p style="margin: 0; color: ${TEXT_BODY}; font-size: 15px; line-height: 1.6;">
              ${text}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderSteps(section: EmailSection, primaryColor: string): string {
  const items = (section.items || []) as string[];
  const listItems = items.map((item, i) => `<li style="margin-bottom: ${i < items.length - 1 ? '8px' : '0'};">${escapeHtml(item)}</li>`).join('\n');

  return `
  <tr>
    <td style="padding: 0 40px 30px 40px;" class="mobile-padding">
      <table border="0" cellspacing="0" cellpadding="0" width="100%" style="background-color: #F1F5F9; border-left: 4px solid ${primaryColor}; border-radius: 4px;">
        <tr>
          <td style="padding: 20px;">
            ${section.title ? `
            <p style="font-family: 'Inter', Arial, Helvetica, sans-serif; font-size: 18px; font-weight: 600; color: ${TEXT_DARK}; margin: 0 0 12px 0;">
              <span style="color: ${TEXT_DARK};">${escapeHtml(section.title)}</span>
            </p>` : ''}
            <ol style="margin: 0; padding-left: 20px; color: ${TEXT_BODY}; font-family: 'Inter', Arial, Helvetica, sans-serif; font-size: 15px; line-height: 1.7;">
              ${listItems}
            </ol>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function renderClosing(section: EmailSection): string {
  const text = (section.text || '').replace(/\n/g, '</p><p style="margin: 0 0 16px 0;">');
  return `
  <tr>
    <td align="left" style="padding: 8px 44px 42px 44px; color: ${TEXT_BODY}; font-family: 'Inter', Arial, Helvetica, sans-serif; font-size: 16px; line-height: 1.7;" class="mobile-padding">
      <p style="margin: 0 0 16px 0;">
        ${text}
      </p>
    </td>
  </tr>`;
}

// ============================================================================
// MAIN BUILDER
// ============================================================================

export function buildEmailHtml(data: EmailData, ctx: EmailContext): string {
  const primaryColor = ctx.enterpriseColor || DEFAULT_PRIMARY;
  const year = new Date().getFullYear();

  const sectionsHtml = data.sections.map(section => {
    switch (section.type) {
      case 'header': return renderHeader(section, primaryColor);
      case 'greeting': return renderGreeting(section);
      case 'paragraph': return renderParagraph(section);
      case 'status_box': return renderStatusBox(section);
      case 'details_box': return renderDetailsBox(section, primaryColor);
      case 'button': return renderButton(section, primaryColor);
      case 'checklist': return renderChecklist(section);
      case 'quote': return renderQuote(section, primaryColor);
      case 'info_box': return renderInfoBox(section);
      case 'steps': return renderSteps(section, primaryColor);
      case 'closing': return renderClosing(section);
      default: return renderParagraph(section);
    }
  }).join('\n');

  const unsubscribeHtml = ctx.unsubscribeUrl
    ? `<p style="margin: 8px 0 0 0; font-size: 11px; color: ${TEXT_SUBTLE};"><a href="${escapeHtml(ctx.unsubscribeUrl)}" style="color: ${TEXT_SUBTLE}; text-decoration: underline;">Cancelar suscripción</a></p>`
    : '';

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${escapeHtml(data.subject)}</title>
  <style type="text/css">
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    table { border-collapse: collapse !important; }
    body { height: 100% !important; margin: 0 !important; padding: 0 !important; width: 100% !important; background-color: #EEF2F7; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }
    .show-on-mobile { display: none; }
    @media screen and (max-width: 600px) {
      .content-table { width: 100% !important; max-width: 100% !important; }
      .column { width: 100% !important; display: block !important; }
      .mobile-padding { padding-left: 15px !important; padding-right: 15px !important; }
      .mobile-center { text-align: center !important; }
      .mobile-hide { display: none !important; }
      .show-on-mobile { display: block !important; }
      .mobile-img-fluid { max-width: 100% !important; height: auto !important; }
      .mobile-h1 { font-size: 24px !important; line-height: 1.2 !important; }
      .mobile-h2 { font-size: 20px !important; line-height: 1.3 !important; }
      .button-link { padding: 14px 20px !important; font-size: 15px !important; }
      .status-bar-text { font-size: 15px !important; }
      .feature-icon { font-size: 18px !important; }
    }
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  </style>
</head>
<body style="margin: 0 !important; padding: 0 !important; background-color: #EEF2F7;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #EEF2F7;">
    <tr>
      <td align="center" valign="top" style="padding: 24px 12px;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 720px; background-color: #ffffff; border-radius: 16px; border: 1px solid ${BORDER_COLOR}; box-shadow: 0 14px 32px rgba(15, 23, 42, 0.08);" class="content-table">
          ${sectionsHtml}
          <!-- FOOTER -->
          <tr>
            <td align="center" style="padding: 24px 44px 28px 44px; border-top: 1px solid ${BORDER_COLOR}; font-family: 'Inter', Arial, Helvetica, sans-serif; font-size: 14px; color: ${TEXT_BODY}; line-height: 1.5;" class="mobile-padding">
              <p style="margin: 0 0 4px 0;">Atentamente,</p>
              <p style="margin: 0; font-weight: 600; color: ${TEXT_DARK}; font-size: 16px;">${escapeHtml(ctx.advisorName)}</p>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: ${TEXT_MUTED};">${escapeHtml(ctx.enterpriseName)}</p>
              <p style="margin: 16px 0 0 0; font-size: 12px; color: ${TEXT_MUTED};">
                &copy; ${year} ${escapeHtml(ctx.enterpriseName)}. Todos los derechos reservados.
              </p>
              ${unsubscribeHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ============================================================================
// HELPERS
// ============================================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Extrae texto plano del JSON de secciones para almacenar como cuerpo_texto
 */
export function extractPlainText(sections: EmailSection[]): string {
  return sections.map(s => {
    switch (s.type) {
      case 'header':
        return `${s.title || ''}${s.subtitle ? '\n' + s.subtitle : ''}`;
      case 'greeting':
      case 'paragraph':
      case 'closing':
        return (s.text || '').replace(/\*\*(.*?)\*\*/g, '$1');
      case 'status_box':
        return `[${s.status || 'ESTADO'}] ${s.message || s.text || ''}`;
      case 'details_box': {
        const items = (s.items || []) as Array<{ label: string; value: string }>;
        return items.map(i => `${i.label}: ${i.value}`).join('\n');
      }
      case 'button':
        return `[${s.text || 'Enlace'}](${s.url || ''})`;
      case 'checklist': {
        const checks = (s.items || []) as string[];
        return checks.map(i => `✓ ${i}`).join('\n');
      }
      case 'quote':
        return `"${s.text || ''}"${s.author ? ` — ${s.author}` : ''}`;
      case 'info_box':
        return `${s.title || ''}\n${s.text || ''}`;
      case 'steps': {
        const steps = (s.items || []) as string[];
        return steps.map((item, i) => `${i + 1}. ${item}`).join('\n');
      }
      default:
        return s.text || '';
    }
  }).filter(Boolean).join('\n\n');
}
