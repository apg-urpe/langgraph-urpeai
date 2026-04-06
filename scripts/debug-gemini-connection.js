const fs = require('fs');
const path = require('path');
const https = require('https');

// Explicit path to .env in the root directory
const envPath = path.resolve(process.cwd(), '.env');

console.log('--- DEBUG START ---');
console.log(`Current Working Directory: ${process.cwd()}`);
console.log(`Looking for .env at: ${envPath}`);

let apiKey = process.env.GEMINI_API_KEY;

if (fs.existsSync(envPath)) {
  console.log('.env file exists. Parsing...');
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');
  for (const line of lines) {
    // Basic parser that handles comments and optional quotes
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      let value = match[2].trim();
      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      if (key === 'GEMINI_API_KEY') {
        apiKey = value;
        console.log('Found GEMINI_API_KEY in .env file.');
        break; // Stop once we find it
      }
    }
  }
} else {
  console.log('.env file NOT found at specified path.');
}

if (!apiKey) {
  console.error('CRITICAL ERROR: GEMINI_API_KEY could not be determined from process.env or .env file.');
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
  console.log(`Response Headers: ${JSON.stringify(res.headers, null, 2)}`);

  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log('--- RESPONSE BODY ---');
    console.log(body);
    console.log('--- END RESPONSE BODY ---');
    
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('TEST PASSED: Connection successful.');
    } else {
      console.log('TEST FAILED: Non-200 status code.');
    }
  });
});

req.on('error', (e) => {
  console.error(`NETWORK ERROR: ${e.message}`);
});

req.write(data);
req.end();
