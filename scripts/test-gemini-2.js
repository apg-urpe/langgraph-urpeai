const fetch = require('node-fetch');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3-flash-preview-exp';

async function testGemini() {
  if (!GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY is not set');
    return;
  }

  console.log(`Testing model: ${MODEL}`);
  
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  
  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: 'Hello, are you working?' }]
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
      console.log('Success!');
      console.log(JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error('Network error:', error);
  }
}

testGemini();
