const fs = require('fs');
const path = require('path');

// Simple .env parser
function loadEnv() {
  try {
    const envPath = path.resolve(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      });
    }
  } catch (e) {
    console.error('Error loading .env:', e);
  }
}

loadEnv();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3-flash-preview';

async function testGemini() {
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set in .env');
    return;
  }

  console.log(`Testing model: ${MODEL}`);
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: 'Hello, respond with "OK"' }]
    }]
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error ${response.status}: ${errorText}`);
    } else {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      console.log('Success! Response:', text);
    }
  } catch (error) {
    console.error('Network error:', error);
  }
}

testGemini();
