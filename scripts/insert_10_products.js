const { getDatabase, syncOfficialProducts, OFFICIAL_10_PRODUCTS } = require('../database/schema');

async function run() {
  console.log('====================================================');
  console.log(' New Tech Medical - Official 10 Products Sync Script');
  console.log('====================================================');

  const db = await getDatabase();

  // Run synchronization
  console.log('Running syncOfficialProducts...');
  syncOfficialProducts(db);

  // Check products in DB
  const products = db.prepare('SELECT id, name, name_en, model, agent, category, description, description_en, image, keywords, active FROM products ORDER BY id ASC').all();

  console.log(`\nTotal products in database: ${products.length}`);
  console.log('\n--- Official 10 Products Verification ---');
  let matchedCount = 0;

  OFFICIAL_10_PRODUCTS.forEach((expected, idx) => {
    const found = products.find(p => p.model === expected.model || p.name === expected.name || p.name_en === expected.name_en);
    if (found) {
      matchedCount++;
      console.log(`[PASS] #${idx + 1} ID: ${found.id} | Model: ${found.model} | Company: ${found.agent}`);
      console.log(`       Name (AR): ${found.name}`);
      console.log(`       Name (EN): ${found.name_en}`);
      console.log(`       Category: ${found.category}`);
      console.log(`       Image: ${found.image}`);
      console.log(`       Desc (AR): ${found.description.substring(0, 60)}...`);
      console.log(`       Desc (EN): ${found.description_en.substring(0, 60)}...`);
    } else {
      console.error(`[FAIL] #${idx + 1} Expected product NOT found: ${expected.name}`);
    }
  });

  console.log(`\nMatched ${matchedCount} of ${OFFICIAL_10_PRODUCTS.length} official products.`);

  // Verify idempotency
  console.log('\nTesting idempotency by running sync again...');
  const countBefore = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
  syncOfficialProducts(db);
  const countAfter = db.prepare('SELECT COUNT(*) as c FROM products').get().c;

  if (countBefore === countAfter) {
    console.log(`[PASS] Idempotency confirmed: count before (${countBefore}) === count after (${countAfter})`);
  } else {
    console.error(`[FAIL] Duplication detected: count before (${countBefore}) !== count after (${countAfter})`);
    process.exit(1);
  }

  console.log('\nSync script completed successfully!');
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal error during sync script:', err);
  process.exit(1);
});
