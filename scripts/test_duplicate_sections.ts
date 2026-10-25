import { localInventoryStore, getStockSections, saveStockSection } from '../src/lib/inventoryService';
import { processSaleAtomic } from '../src/lib/salesService';
import { DEMO_STAFF } from '../src/lib/demoData';

async function runDuplicateSectionTest() {
  console.log('--- STARTING DUPLICATE SECTION NAME & UNIQUE IDENTIFIER VERIFICATION ---');

  // 1. Create first section: "Polo Shirt" with 0 pieces
  const sec1Res = await saveStockSection({
    section_code: 'SEC-POLO-DEPLETED',
    name: 'Polo Shirt',
    category: 'Men',
    selling_price_kobo: 300000,
    low_stock_threshold: 5,
  });

  if (!sec1Res.success || !sec1Res.data) {
    throw new Error('Failed to create sec 1');
  }
  console.log(`✅ Created Sec 1: "${sec1Res.data.name}" with code [${sec1Res.data.section_code}], Available: ${sec1Res.data.available_stock} pcs`);

  // 2. Create second section with identical name "Polo Shirt" but available stock 15 pcs
  const sec2Res = await saveStockSection({
    section_code: 'SEC-POLO-ACTIVE',
    name: 'Polo Shirt',
    category: 'Men',
    selling_price_kobo: 300000,
    low_stock_threshold: 5,
    physical_stock: 15,
    available_stock: 15,
  });

  if (!sec2Res.success || !sec2Res.data) {
    throw new Error('Failed to create sec 2');
  }
  console.log(`✅ Created Sec 2: "${sec2Res.data.name}" with code [${sec2Res.data.section_code}], Available: ${sec2Res.data.available_stock} pcs`);

  // 3. Test recalculateBalances preservation
  localInventoryStore.recalculateBalances();
  const sec2AfterRecalc = localInventoryStore.sections.find((s) => s.id === sec2Res.data!.id);
  if (!sec2AfterRecalc || sec2AfterRecalc.available_stock !== 15) {
    throw new Error(`recalculateBalances wiped out stock! Expected 15, got: ${sec2AfterRecalc?.available_stock}`);
  }
  console.log('✅ Balance preservation verified: recalculateBalances did not wipe out positive stock for un-ledgered section.');

  // 4. Attempt to sell 1 pc from the depleted Polo section (SEC-POLO-DEPLETED)
  const failRes = await processSaleAtomic({
    staff_id: DEMO_STAFF.id,
    items: [{ section_id: sec1Res.data.id, quantity: 1 }],
    payments: [{ method: 'cash', amount_kobo: 300000 }],
  });

  if (failRes.success) {
    throw new Error('Expected depleted section to fail checkout!');
  }
  if (!failRes.error?.includes('SEC-POLO-DEPLETED')) {
    throw new Error(`Expected error to mention [SEC-POLO-DEPLETED], got: ${failRes.error}`);
  }
  console.log(`✅ Depleted section checkout correctly failed with clear identifier: "${failRes.error}"`);

  // 5. Attempt to sell 2 pcs from the active Polo section (SEC-POLO-ACTIVE)
  const passRes = await processSaleAtomic({
    staff_id: DEMO_STAFF.id,
    items: [{ section_id: sec2Res.data.id, quantity: 2 }],
    payments: [{ method: 'cash', amount_kobo: 600000 }],
  });

  if (!passRes.success || !passRes.data) {
    throw new Error(`Expected active section to succeed checkout, got: ${passRes.error}`);
  }
  console.log(`✅ Active section checkout SUCCEEDED! Receipt: ${passRes.data.receipt_number}`);

  // Verify stock decremented only on Sec 2
  const sec2Final = localInventoryStore.sections.find((s) => s.id === sec2Res.data!.id);
  const sec1Final = localInventoryStore.sections.find((s) => s.id === sec1Res.data!.id);

  if (sec2Final?.available_stock !== 13) {
    throw new Error(`Expected Sec 2 stock to be 13, got ${sec2Final?.available_stock}`);
  }
  if (sec1Final?.available_stock !== 0) {
    throw new Error(`Expected Sec 1 stock to remain 0, got ${sec1Final?.available_stock}`);
  }
  console.log(`✅ Stocks atomically isolated: Sec 1 remains 0 pcs, Sec 2 decremented from 15 to 13 pcs.`);

  console.log('\n🎉 ALL DUPLICATE SECTION & IDENTIFIER TESTS PASSED!\n');
}

runDuplicateSectionTest().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
