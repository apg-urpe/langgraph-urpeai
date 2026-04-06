/**
 * Kapso Platform API client (server-side only).
 * Separate from @kapso/whatsapp-cloud-api which is for messaging.
 * This handles customer management and setup links.
 */

const KAPSO_PLATFORM_BASE = 'https://api.kapso.ai/platform/v1';

function getApiKey(): string {
  const key = process.env.KAPSO_API_KEY;
  if (!key) throw new Error('KAPSO_API_KEY no está configurado');
  return key;
}

function headers(): HeadersInit {
  return {
    'X-API-Key': getApiKey(),
    'Content-Type': 'application/json',
  };
}

export interface KapsoCustomer {
  id: string;
  name: string;
  external_customer_id: string;
}

export interface KapsoSetupLink {
  url: string;
  expires_at?: string;
}

/**
 * Look up an existing Kapso customer by external_customer_id.
 * Returns null if not found.
 */
export async function findCustomerByExternalId(
  externalCustomerId: string
): Promise<KapsoCustomer | null> {
  const res = await fetch(
    `${KAPSO_PLATFORM_BASE}/customers?external_customer_id=${encodeURIComponent(externalCustomerId)}`,
    { method: 'GET', headers: headers() }
  );

  if (!res.ok) return null;

  const json = await res.json();
  const customers: KapsoCustomer[] = json.data ?? json.customers ?? [];
  return customers.length > 0 ? customers[0] : null;
}

/**
 * Create a new Kapso customer.
 * If the customer already exists (conflict), tries to look it up by external ID.
 */
export async function createCustomer(
  name: string,
  externalCustomerId: string
): Promise<KapsoCustomer> {
  const res = await fetch(`${KAPSO_PLATFORM_BASE}/customers`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      customer: {
        name,
        external_customer_id: externalCustomerId,
      },
    }),
  });

  if (res.ok) {
    const json = await res.json();
    return json.data as KapsoCustomer;
  }

  // If conflict (customer already exists), try to find it
  if (res.status === 409 || res.status === 422) {
    const existing = await findCustomerByExternalId(externalCustomerId);
    if (existing) return existing;
  }

  const body = await res.text();
  throw new Error(`Kapso createCustomer failed (${res.status}): ${body}`);
}

export async function createSetupLink(
  customerId: string,
  successRedirectUrl: string,
  failureRedirectUrl: string
): Promise<KapsoSetupLink> {
  const res = await fetch(
    `${KAPSO_PLATFORM_BASE}/customers/${customerId}/setup_links`,
    {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        setup_link: {
          language: 'es',
          success_redirect_url: successRedirectUrl,
          failure_redirect_url: failureRedirectUrl,
          theme_config: {
            primary_color: '#10b981',
            background_color: '#0a0a0c',
            text_color: '#e4e4e7',
          },
        },
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Kapso createSetupLink failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  return json.data as KapsoSetupLink;
}
