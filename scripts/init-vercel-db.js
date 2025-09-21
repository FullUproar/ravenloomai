#!/usr/bin/env node

import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

async function initDatabase() {
  const url = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}/api/init-db`
    : 'http://localhost:3000/api/init-db';

  console.log('🔧 Initializing Vercel database...');
  console.log('   URL:', url);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.INIT_DB_SECRET || 'development-secret'}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Database initialized successfully!');
      console.log('   Projects:', data.projectCount);
    } else {
      console.error('❌ Failed to initialize database:', data.error);
      if (data.details) {
        console.error('   Details:', data.details);
      }
    }
  } catch (error) {
    console.error('❌ Error connecting to API:', error.message);
  }
}

initDatabase();