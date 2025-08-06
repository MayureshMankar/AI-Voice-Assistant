// Create this as check-env.js in your server folder
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Simulate __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
const envPath = path.resolve(__dirname, '../.env');
console.log('Loading .env from:', envPath);

dotenv.config({ path: envPath });

console.log('\n=== Environment Variables Check ===');
console.log('OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
console.log('OPENAI_API_KEY length:', process.env.OPENAI_API_KEY?.length || 0);
console.log('OPENAI_API_KEY preview:', process.env.OPENAI_API_KEY?.substring(0, 20) + '...' || 'undefined');

// Check for other possible API key names
const possibleKeys = [
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY', 
  'OPENAI_KEY',
  'API_KEY'
];

console.log('\n=== All possible API keys ===');
possibleKeys.forEach(key => {
  console.log(`${key}:`, process.env[key] ? `${process.env[key].substring(0, 20)}...` : 'not found');
});

console.log('\n=== .env file exists check ===');
import fs from 'fs';
try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  console.log('.env file exists and readable');
  console.log('Lines in .env:', envContent.split('\n').length);
  console.log('Contains OPENAI_API_KEY:', envContent.includes('OPENAI_API_KEY'));
} catch (error) {
  console.log('.env file error:', error.message);
}