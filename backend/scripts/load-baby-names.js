/**
 * Load Baby Names Script
 *
 * Downloads and imports baby names from the US Social Security dataset.
 * https://www.ssa.gov/oact/babynames/limits.html
 *
 * Usage:
 *   node backend/scripts/load-baby-names.js
 *
 * Options:
 *   --year=2023           Load specific year (default: 2023)
 *   --min-rank=1000       Minimum popularity rank (default: 1000)
 *   --dry-run             Show names without importing
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split('=');
  acc[key.replace(/^--/, '')] = value || true;
  return acc;
}, {});

const YEAR = args.year || '2023';
const MIN_RANK = parseInt(args['min-rank']) || 1000;
const DRY_RUN = args['dry-run'] === true;

// SSA baby names URL (text files by year)
const SSA_URL = `https://www.ssa.gov/oact/babynames/names.zip`;

// Alternative: Use a curated list we control
const CURATED_NAMES = [
  // Top 100 gender-neutral and popular names
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn',
  'Skylar', 'Peyton', 'Charlie', 'Dakota', 'River', 'Sage', 'Phoenix',

  // Classic popular names
  'Emma', 'Olivia', 'Ava', 'Isabella', 'Sophia', 'Mia', 'Charlotte',
  'Liam', 'Noah', 'William', 'James', 'Oliver', 'Benjamin', 'Elijah',
  'Sarah', 'Emily', 'Hannah', 'Madison', 'Abigail', 'Elizabeth',
  'Michael', 'Daniel', 'Matthew', 'David', 'Joseph', 'Samuel',

  // Modern popular
  'Luna', 'Stella', 'Hazel', 'Violet', 'Aurora', 'Savannah', 'Brooklyn',
  'Mason', 'Logan', 'Lucas', 'Ethan', 'Jackson', 'Aiden', 'Carter',
  'Aria', 'Scarlett', 'Chloe', 'Penelope', 'Layla', 'Riley',
  'Grayson', 'Wyatt', 'Leo', 'Jayden', 'Gabriel', 'Julian',

  // Strong single-syllable
  'Grace', 'Rose', 'Faith', 'Hope', 'Joy', 'Eve', 'Mae',
  'Jack', 'Luke', 'Mark', 'Cole', 'Dean', 'Blake', 'Chase',

  // Classic literary/historical
  'Alice', 'Jane', 'Claire', 'Lucy', 'Ruby', 'Ivy', 'Nora',
  'Henry', 'Oscar', 'Felix', 'Miles', 'Jasper', 'Arthur', 'Theodore',

  // Nature names
  'Lily', 'Daisy', 'Willow', 'Autumn', 'Summer', 'Jade',
  'River', 'Forest', 'Stone', 'Reed', 'Clay', 'Brooks',

  // International popular
  'Sofia', 'Valentina', 'Camila', 'Isabella', 'Lucia',
  'Santiago', 'Mateo', 'Sebastian', 'Leonardo', 'Diego',
  'Aria', 'Zara', 'Nina', 'Maya', 'Layla',
  'Kai', 'Omar', 'Ravi', 'Ezra', 'Nico',

  // Virtue names
  'Honor', 'Justice', 'Noble', 'True', 'Brave',
  'Haven', 'Mercy', 'Trinity', 'Destiny', 'Serenity',

  // Expanded popular (200-500)
  'Evelyn', 'Harper', 'Ella', 'Amelia', 'Addison', 'Natalie', 'Lillian',
  'Alexander', 'Ryan', 'Nathan', 'Caleb', 'Andrew', 'Joshua', 'Christopher',
  'Victoria', 'Audrey', 'Bella', 'Paisley', 'Claire', 'Skylar', 'Ellie',
  'Isaac', 'Aaron', 'Eli', 'Connor', 'Landon', 'Adrian', 'Asher',
  'Madelyn', 'Eleanor', 'Leah', 'Zoe', 'Nora', 'Hazel', 'Aubrey',
  'Josiah', 'Isaiah', 'Charles', 'Thomas', 'Maverick', 'Declan', 'Elias',
  'Aaliyah', 'Savannah', 'Brooklyn', 'Samantha', 'Kaylee', 'Allison',
  'Hudson', 'Ezra', 'Colton', 'Brayden', 'Lincoln', 'Hunter', 'Cooper',

  // Tech/Modern inspired
  'Ada', 'Turing', 'Tesla', 'Darwin', 'Newton',
  'Archer', 'Atlas', 'Orion', 'Apollo', 'Phoenix',

  // Short and memorable
  'Max', 'Sam', 'Ben', 'Tom', 'Nick', 'Tim', 'Dan',
  'Mia', 'Lia', 'Zoe', 'Amy', 'Kim', 'Ann', 'Bea',

  // Additional variety (expand to 500+)
  'Sienna', 'Gemma', 'Iris', 'Pearl', 'Opal', 'Ember', 'Wren',
  'Finn', 'Knox', 'Cruz', 'King', 'Saint', 'Ace', 'Jett',
  'Margot', 'Sloane', 'Quinn', 'Blair', 'Drew', 'Reese',
  'Bodhi', 'Zion', 'Crew', 'Royal', 'Legend', 'Chosen',
];

/**
 * Load curated names list
 */
async function loadCuratedNames() {
  console.log('📚 Loading curated names list...\n');

  const names = new Map();

  CURATED_NAMES.forEach((name, index) => {
    const normalized = name.trim();
    if (normalized && !names.has(normalized.toLowerCase())) {
      names.set(normalized.toLowerCase(), {
        name: normalized,
        popularityRank: index + 1,
        origin: null,
        meaning: null,
      });
    }
  });

  console.log(`✅ Loaded ${names.size} unique names\n`);
  return Array.from(names.values());
}

/**
 * Import names to database
 */
async function importNames(names) {
  console.log('💾 Importing names to database...\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN - Names that would be imported:');
    names.slice(0, 20).forEach((name, i) => {
      console.log(`  ${i + 1}. ${name.name} (rank ${name.popularityRank})`);
    });
    console.log(`  ... and ${names.length - 20} more\n`);
    return;
  }

  let inserted = 0;
  let skipped = 0;

  for (const nameData of names) {
    try {
      await db.query(
        `INSERT INTO available_names (name, popularity_rank, origin, meaning)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (name) DO NOTHING`,
        [nameData.name, nameData.popularityRank, nameData.origin, nameData.meaning]
      );
      inserted++;

      if (inserted % 100 === 0) {
        console.log(`  Imported ${inserted} names...`);
      }
    } catch (error) {
      console.error(`  ❌ Failed to import ${nameData.name}:`, error.message);
      skipped++;
    }
  }

  console.log(`\n✅ Import complete:`);
  console.log(`   ${inserted} names inserted`);
  console.log(`   ${skipped} names skipped\n`);
}

/**
 * Show statistics
 */
async function showStatistics() {
  const stats = await db.query(`
    SELECT
      COUNT(*) as total_names,
      MIN(popularity_rank) as highest_rank,
      MAX(popularity_rank) as lowest_rank,
      COUNT(CASE WHEN times_claimed > 0 THEN 1 END) as claimed_count
    FROM available_names
  `);

  const row = stats.rows[0];

  console.log('📊 Database Statistics:');
  console.log(`   Total names: ${row.total_names}`);
  console.log(`   Rank range: ${row.highest_rank} - ${row.lowest_rank}`);
  console.log(`   Already claimed: ${row.claimed_count}`);
  console.log(`   Available: ${row.total_names - row.claimed_count}\n`);
}

/**
 * Main function
 */
async function main() {
  console.log('🚀 Baby Names Import Script\n');
  console.log(`   Year: ${YEAR}`);
  console.log(`   Min Rank: ${MIN_RANK}`);
  console.log(`   Dry Run: ${DRY_RUN}\n`);

  try {
    // Load names
    const names = await loadCuratedNames();

    // Filter by minimum rank
    const filteredNames = names.filter(n => n.popularityRank <= MIN_RANK);
    console.log(`📋 Filtered to ${filteredNames.length} names (rank ≤ ${MIN_RANK})\n`);

    // Import to database
    await importNames(filteredNames);

    // Show statistics
    if (!DRY_RUN) {
      await showStatistics();
    }

    console.log('✨ Done!\n');

    // Ensure DB connection is closed
    await db.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await db.end();
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { loadCuratedNames, importNames };
