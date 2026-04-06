const fs = require('fs');
const path = require('path');
const https = require('https');

// Explicit path to .env in the root directory
const envPath = path.resolve(process.cwd(), '.env');

console.log('--- DEBUG START ---');
let apiKey = process.env.GEMINI_API_KEY;

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key === 'GEMINI_API_KEY') {
        apiKey = value;
        break;
      }
    }
  }
}

if (!apiKey) {
  console.error('CRITICAL ERROR: GEMINI_API_KEY not found.');
  process.exit(1);
}

const hostname = 'generativelanguage.googleapis.com';
const pth = `/v1beta/models?key=${apiKey}`;

const options = {
  hostname: hostname,
  path: pth,
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
};

console.log(`Sending request to: https://${hostname}${pth.replace(apiKey, 'HIDDEN_KEY')}`);

const req = https.request(options, (res) => {
  console.log(`Response Status Code: ${res.statusCode}`);
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(body);
      if (parsed.models) {
        console.log('Available Models:');
        parsed.models.forEach(m => {
          if (m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent')) {
             console.log(`- ${m.name} (${m.displayName})`);
          }
        });
      } else {
        console.log('Response:', JSON.stringify(parsed, null, 2));
      }
    } catch (e) {
      console.log('Response body:', body);
    }
  });
});

req.on('error', (e) => {
  console.error(`NETWORK ERROR: ${e.message}`);
});

req.end();
