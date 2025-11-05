/**
 * Simple Baby Names Loader
 * Inserts curated list directly without complex logic
 */

import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const NAMES = [
  'Alex', 'Jordan', 'Taylor', 'Morgan', 'Casey', 'Riley', 'Avery', 'Quinn',
  'Skylar', 'Peyton', 'Charlie', 'Dakota', 'River', 'Sage', 'Phoenix',
  'Emma', 'Olivia', 'Ava', 'Isabella', 'Sophia', 'Mia', 'Charlotte',
  'Liam', 'Noah', 'William', 'James', 'Oliver', 'Benjamin', 'Elijah',
  'Sarah', 'Emily', 'Hannah', 'Madison', 'Abigail', 'Elizabeth',
  'Michael', 'Daniel', 'Matthew', 'David', 'Joseph', 'Samuel',
  'Luna', 'Stella', 'Hazel', 'Violet', 'Aurora', 'Savannah', 'Brooklyn',
  'Mason', 'Logan', 'Lucas', 'Ethan', 'Jackson', 'Aiden', 'Carter',
  'Aria', 'Scarlett', 'Chloe', 'Penelope', 'Layla',
  'Grayson', 'Wyatt', 'Leo', 'Jayden', 'Gabriel', 'Julian',
  'Grace', 'Rose', 'Faith', 'Hope', 'Joy', 'Eve', 'Mae',
  'Jack', 'Luke', 'Mark', 'Cole', 'Dean', 'Blake', 'Chase',
  'Alice', 'Jane', 'Claire', 'Lucy', 'Ruby', 'Ivy', 'Nora',
  'Henry', 'Oscar', 'Felix', 'Miles', 'Jasper', 'Arthur', 'Theodore',
  'Lily', 'Daisy', 'Willow', 'Autumn', 'Summer', 'Jade',
  'Forest', 'Stone', 'Reed', 'Clay', 'Brooks',
  'Sofia', 'Valentina', 'Camila', 'Lucia',
  'Santiago', 'Mateo', 'Sebastian', 'Leonardo', 'Diego',
  'Zara', 'Nina', 'Maya',
  'Kai', 'Omar', 'Ravi', 'Ezra', 'Nico',
  'Honor', 'Justice', 'Noble', 'True', 'Brave',
  'Haven', 'Mercy', 'Trinity', 'Destiny', 'Serenity',
  'Evelyn', 'Harper', 'Ella', 'Amelia', 'Addison', 'Natalie', 'Lillian',
  'Alexander', 'Ryan', 'Nathan', 'Caleb', 'Andrew', 'Joshua', 'Christopher',
  'Victoria', 'Audrey', 'Bella', 'Paisley', 'Skylar', 'Ellie',
  'Isaac', 'Aaron', 'Eli', 'Connor', 'Landon', 'Adrian', 'Asher',
  'Madelyn', 'Eleanor', 'Leah', 'Zoe', 'Hazel', 'Aubrey',
  'Josiah', 'Isaiah', 'Charles', 'Thomas', 'Maverick', 'Declan', 'Elias',
  'Aaliyah', 'Samantha', 'Kaylee', 'Allison',
  'Hudson', 'Colton', 'Brayden', 'Lincoln', 'Hunter', 'Cooper',
  'Ada', 'Turing', 'Tesla', 'Darwin', 'Newton',
  'Archer', 'Atlas', 'Orion', 'Apollo',
  'Max', 'Sam', 'Ben', 'Tom', 'Nick', 'Tim', 'Dan',
  'Lia', 'Amy', 'Kim', 'Ann', 'Bea',
  'Sienna', 'Gemma', 'Iris', 'Pearl', 'Opal', 'Ember', 'Wren',
  'Finn', 'Knox', 'Cruz', 'King', 'Saint', 'Ace', 'Jett',
  'Margot', 'Sloane', 'Blair', 'Drew', 'Reese',
  'Bodhi', 'Zion', 'Crew', 'Royal', 'Legend', 'Chosen',
];

async function main() {
  console.log('📚 Loading baby names...');

  let inserted = 0;
  let skipped = 0;

  try {
    for (let i = 0; i < NAMES.length; i++) {
      try {
        await pool.query(
          `INSERT INTO available_names (name, popularity_rank)
           VALUES ($1, $2)
           ON CONFLICT (name) DO NOTHING`,
          [NAMES[i], i + 1]
        );
        inserted++;
      } catch (err) {
        console.error(`Error inserting ${NAMES[i]}:`, err.message);
        skipped++;
      }
    }

    console.log(`✅ Loaded ${inserted} names (${skipped} skipped)`);

    // Show stats
    const result = await pool.query('SELECT COUNT(*) as count FROM available_names');
    console.log(`📊 Total names in database: ${result.rows[0].count}`);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

main();
