const fs = require('fs');
const path = require('path');
const https = require('https');

// Path to .env (adjust if needed)
const envPath = path.join(__dirname, '..', '.env');

console.log('Loading .env from:', envPath);

let apiKey = process.env.GEMINI_API_KEY;

if (!apiKey && fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^GEMINI_API_KEY=(.*)$/);
    if (match) {
      apiKey = match[1].trim().replace(/^["']|["']$/g, '');
      console.log('Found GEMINI_API_KEY in .env');
      break;
    }
  }
}

if (!apiKey) {
  console.error('ERROR: GEMINI_API_KEY not found in process.env or .env file');
  process.exit(1);
}

console.log(`API Key loaded (starts with): ${apiKey.substring(0, 4)}...`);

const MODEL = 'gemini-3-flash-preview';
const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

const data = JSON.stringify({
  contents: [{
    role: 'user',
    parts: [{ text: 'Reply with "Connection Successful"' }]
  }]
});

const options = {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

console.log(`Testing connection to ${MODEL}...`);

const req = https.request(url, options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('Status:', res.statusCode);
      try {
        const parsed = JSON.parse(body);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log('Response:', text ? text.trim() : 'No text in response');
        console.log('FULL SUCCESS');
      } catch (e) {
        console.log('Response body:', body);
      }
    } else {
      console.error(`Request failed with status: ${res.statusCode}`);
      console.error('Response:', body);
    }
  });
});

req.on('error', (e) => {
  console.error('Network error:', e);
});

req.write(data);
req.end();
