import {
  processSaleAtomic,
  cancelOrRefundSale,
  getSalesHistory,
  getSaleReceipt,
  localSalesStore,
} from '../src/lib/salesService';
import { localInventoryStore, getStockSections } from '../src/lib/inventoryService';
import { DEMO_STAFF, DEMO_STAFF_2, DEMO_OWNER } from '../src/lib/demoData';

async function runTests() {
  console.log('--- STARTING PHASE 3 POS & SALES ATOMIC VERIFICATION TESTS ---\n');

  // Ensure fresh store state
  localInventoryStore.recalculateBalances();
  const initialSections = await getStockSections();
  const targetSection = initialSections.data?.find((s) => s.available_stock > 10);

  if (!targetSection) {
    throw new Error('No section with stock > 10 found for testing.');
  }

  const initialAvailableStock = targetSection.available_stock;
  console.log(`[SETUP] Target section: "${targetSection.name}" (Initial Available: ${initialAvailableStock} pcs)`);

  // TEST 1: Insufficient Stock Rejection
  console.log('\n--- TEST 1: Insufficient Stock Rejection ---');
  const excessQty = initialAvailableStock + 999;
  const insufficientRes = await processSaleAtomic(
    {
      staff_id: DEMO_STAFF.id,
      items: [{ section_id: targetSection.id, quantity: excessQty }],
      payments: [{ method: 'cash', amount_kobo: excessQty * targetSection.selling_price_kobo }],
    },
    DEMO_STAFF
  );

  if (!insufficientRes.success && insufficientRes.error?.includes('Insufficient stock')) {
    console.log('✅ TEST 1 PASSED: Correctly rejected overselling attempt:', insufficientRes.error);
  } else {
    throw new Error(`TEST 1 FAILED: Expected rejection for stock overflow, got: ${JSON.stringify(insufficientRes)}`);
  }

  // TEST 2: Split Payments & Atomic Stock Deduction
  console.log('\n--- TEST 2: Split Payments & Atomic Stock Deduction ---');
  const purchaseQty = 2;
  const lineTotal = purchaseQty * targetSection.selling_price_kobo;
  const discountKobo = 50000; // ₦500 discount
  const netTotal = lineTotal - discountKobo;

  // Split into Cash + Bank Transfer
  const cashPart = Math.floor(netTotal / 2);
  const transferPart = netTotal - cashPart;

  const testIdempotencyKey = `test-idem-${Date.now()}`;

  const validSaleRes = await processSaleAtomic(
    {
      staff_id: DEMO_STAFF.id,
      items: [{ section_id: targetSection.id, quantity: purchaseQty }],
      payments: [
        { method: 'cash', amount_kobo: cashPart, reference: 'Cash Tendered' },
        { method: 'bank_transfer', amount_kobo: transferPart, reference: 'TRF-TEST-8891' },
      ],
      discount_kobo: discountKobo,
      idempotency_key: testIdempotencyKey,
    },
    DEMO_STAFF
  );

  if (!validSaleRes.success || !validSaleRes.data) {
    throw new Error(`TEST 2 FAILED: Could not process valid sale: ${validSaleRes.error}`);
  }

  const sale = validSaleRes.data;
  console.log(`✅ TEST 2 PASSED: Sale ${sale.receipt_number} completed.`);
  console.log(`   Net Total: ₦${sale.total_kobo / 100}, Items Count: ${sale.items_count}`);
  console.log(`   Split Payments count: ${sale.payments?.length}`);

  // Check section balance deducted
  const afterSaleSections = await getStockSections();
  const afterSection = afterSaleSections.data?.find((s) => s.id === targetSection.id);
  const expectedStock = initialAvailableStock - purchaseQty;
  if (afterSection?.available_stock === expectedStock) {
    console.log(`✅ TEST 2.1 PASSED: Stock balance atomically decremented to ${expectedStock} pcs.`);
  } else {
    throw new Error(`TEST 2.1 FAILED: Expected ${expectedStock} available, got ${afterSection?.available_stock}`);
  }

  // TEST 3: Idempotency Protection Against Duplicate Submissions
  console.log('\n--- TEST 3: Idempotency Protection Against Duplicate Submissions ---');
  const duplicateRes = await processSaleAtomic(
    {
      staff_id: DEMO_STAFF.id,
      items: [{ section_id: targetSection.id, quantity: purchaseQty }],
      payments: [
        { method: 'cash', amount_kobo: cashPart },
        { method: 'bank_transfer', amount_kobo: transferPart },
      ],
      discount_kobo: discountKobo,
      idempotency_key: testIdempotencyKey, // EXACT SAME KEY
    },
    DEMO_STAFF
  );

  if (duplicateRes.success && duplicateRes.idempotencyHit && duplicateRes.data?.id === sale.id) {
    console.log('✅ TEST 3 PASSED: Duplicate request safely recognized via idempotency cache. Same sale returned.');
    // Check that stock was NOT deducted again
    const afterDupSections = await getStockSections();
    const afterDup = afterDupSections.data?.find((s) => s.id === targetSection.id);
    if (afterDup?.available_stock === expectedStock) {
      console.log('✅ TEST 3.1 PASSED: Stock was NOT double-deducted.');
    } else {
      throw new Error(`TEST 3.1 FAILED: Stock was double-deducted! Current: ${afterDup?.available_stock}`);
    }
  } else {
    throw new Error(`TEST 3 FAILED: Idempotency did not recognize duplicate. Result: ${JSON.stringify(duplicateRes)}`);
  }

  // TEST 4: Historical Price Snapshot & Staff Confidentiality
  console.log('\n--- TEST 4: Price Snapshot & Confidentiality ---');
  const receiptRes = await getSaleReceipt(sale.receipt_number, 'staff');
  if (receiptRes.success && receiptRes.data) {
    const item = receiptRes.data.items?.[0];
    if (item && item.unit_price_kobo === targetSection.selling_price_kobo && item.cost_snapshot_kobo === undefined) {
      console.log('✅ TEST 4 PASSED: Price snapshot preserved and cost data hidden from staff query.');
    } else {
      throw new Error(`TEST 4 FAILED: Item cost snapshot was leaked or unit price invalid.`);
    }
  }

  // TEST 5: Concurrent Checkout Simulation
  console.log('\n--- TEST 5: Concurrent Checkout Simulation ---');
  // Target section currently has expectedStock left.
  // We send two concurrent checkouts where each requests the full remaining stock.
  // One must succeed, and the second must be rejected because stock is depleted.
  const remainingStock = afterSection?.available_stock || 1;
  const p1 = processSaleAtomic(
    {
      staff_id: DEMO_STAFF.id,
      items: [{ section_id: targetSection.id, quantity: remainingStock }],
      payments: [{ method: 'cash', amount_kobo: remainingStock * targetSection.selling_price_kobo }],
      idempotency_key: `concurrent-1-${Date.now()}`,
    },
    DEMO_STAFF
  );

  const p2 = processSaleAtomic(
    {
      staff_id: DEMO_STAFF_2.id,
      items: [{ section_id: targetSection.id, quantity: remainingStock }],
      payments: [{ method: 'cash', amount_kobo: remainingStock * targetSection.selling_price_kobo }],
      idempotency_key: `concurrent-2-${Date.now()}`,
    },
    DEMO_STAFF_2
  );

  const [res1, res2] = await Promise.all([p1, p2]);
  const successes = [res1, res2].filter((r) => r.success);
  const rejections = [res1, res2].filter((r) => !r.success);

  if (successes.length === 1 && rejections.length === 1) {
    console.log('✅ TEST 5 PASSED: Concurrent checkouts accurately permitted only available capacity and rejected oversell.');
    console.log('   Rejection message:', rejections[0].error);
  } else {
    throw new Error(`TEST 5 FAILED: Expected 1 success and 1 rejection, got: ${successes.length} successes.`);
  }

  // TEST 6: Authorised Cancellation / Refund & Stock Reversal
  console.log('\n--- TEST 6: Authorised Cancellation / Refund & Stock Reversal ---');
  // Cancel the sale from TEST 2
  const refundRes = await cancelOrRefundSale(
    {
      sale_id: sale.id,
      actor_id: DEMO_OWNER.id,
      actor_name: DEMO_OWNER.full_name,
      reason: 'Customer returned unworn garment within 24hr policy',
      action_type: 'refunded',
    },
    DEMO_OWNER
  );

  if (refundRes.success && refundRes.data?.status === 'refunded') {
    console.log(`✅ TEST 6 PASSED: Sale ${sale.receipt_number} refunded by Owner.`);
    console.log(`   Cancellation Reason: "${refundRes.data.cancellation_reason}"`);

    // Verify compensating inventory movement was recorded
    const movements = localInventoryStore.movements;
    const reversalMovement = movements.find(
      (m) => m.reference_id === sale.id && m.movement_type === 'return'
    );

    if (reversalMovement && reversalMovement.quantity_change === purchaseQty) {
      console.log(`✅ TEST 6.1 PASSED: Compensating ledger return recorded (+${reversalMovement.quantity_change} pcs).`);
    } else {
      throw new Error(`TEST 6.1 FAILED: Missing return movement for sale ${sale.id}`);
    }
  } else {
    throw new Error(`TEST 6 FAILED: Refund operation failed: ${refundRes.error}`);
  }

  // TEST 7: Staff Privacy & Sales History Filtering
  console.log('\n--- TEST 7: Staff Sales Isolation & Owner Master History ---');
  const staffSales = await getSalesHistory({}, DEMO_STAFF);
  const otherStaffRecords = staffSales.data.filter((s) => s.staff_id !== DEMO_STAFF.id);
  if (otherStaffRecords.length === 0) {
    console.log(`✅ TEST 7.1 PASSED: Staff account retrieved only their own ${staffSales.data.length} sales.`);
  } else {
    throw new Error(`TEST 7.1 FAILED: Staff retrieved other staffs' sales! Count: ${otherStaffRecords.length}`);
  }

  const ownerSales = await getSalesHistory({}, DEMO_OWNER);
  if (ownerSales.data.length > staffSales.data.length) {
    console.log(`✅ TEST 7.2 PASSED: Owner retrieved store-wide sales (${ownerSales.data.length} receipts).`);
  } else {
    throw new Error(`TEST 7.2 FAILED: Owner did not see full store receipts.`);
  }

  console.log('\n======================================================');
  console.log('🎉 ALL 7 PHASE 3 VERIFICATION TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
