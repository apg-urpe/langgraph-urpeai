const fs = require('fs');
const path = require('path');
const https = require('https');

// Explicit path to .env in the root directory
const envPath = path.resolve(process.cwd(), '.env');

console.log('--- VERIFY GEMINI 2.0 FLASH START ---');
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

// Mask key for logging
const maskedKey = apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4);
console.log(`Using API Key: ${maskedKey}`);

const MODEL = 'gemini-3-flash-preview';
const hostname = 'generativelanguage.googleapis.com';
const pth = `/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

const data = JSON.stringify({
  contents: [{
    role: 'user',
    parts: [{ text: 'Ping' }]
  }]
});

const options = {
  hostname: hostname,
  path: pth,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

console.log(`Sending request to: https://${hostname}${pth.replace(apiKey, 'HIDDEN_KEY')}`);

const req = https.request(options, (res) => {
  console.log(`Response Status Code: ${res.statusCode}`);
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('--- RESPONSE BODY ---');
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        const parsed = JSON.parse(body);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log('Success! Response:', text ? text.trim() : 'No text');
      } catch (e) {
        console.log(body);
      }
    } else {
      console.log(body);
    }
    console.log('--- END RESPONSE BODY ---');
  });
});

req.on('error', (e) => {
  console.error(`NETWORK ERROR: ${e.message}`);
});

req.write(data);
req.end();
