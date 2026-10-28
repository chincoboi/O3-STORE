import { localInventoryStore, getStockSections } from './src/lib/inventoryService';
import { submitDamageReport, reviewDamageReport, getDamageReports } from './src/lib/damageService';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

async function runPhase4Tests() {
  console.log('\n======================================================');
  console.log('🧪 RUNNING O3 VARIETIES PHASE 4 DAMAGE SUITE');
  console.log('======================================================\n');

  // Reset/recalculate local store to clean state
  localInventoryStore.recalculateBalances();

  // Find a target test section
  const targetSection = localInventoryStore.sections.find((s) => s.id === 'sec-1');
  assert(Boolean(targetSection), 'Found target section sec-1 for testing');

  const initialPhysical = targetSection!.physical_stock;
  const initialReserved = targetSection!.reserved_stock;
  const initialAvailable = targetSection!.available_stock;

  console.log(`Initial state for "${targetSection!.name}": Physical=${initialPhysical}, Reserved=${initialReserved}, Available=${initialAvailable}`);

  // --------------------------------------------------------------------------
  // TEST 1: Submit Damage Report & Verify Reservation
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 1: Submit Damage Report & Verify Reservation ---');
  const report1Res = await submitDamageReport({
    staff_id: 'demo-staff-002',
    staff_name: 'Chidinma Eze',
    section_id: 'sec-1',
    quantity: 3,
    damage_type: 'tear',
    description: 'Torn collar seam found during hanger placement',
  });

  assert(report1Res.success, 'Damage report 1 submitted successfully');
  const report1 = report1Res.data!;
  assert(report1.status === 'pending', 'Damage report 1 status is pending');

  const afterReport1Section = localInventoryStore.sections.find((s) => s.id === 'sec-1')!;
  assert(
    afterReport1Section.physical_stock === initialPhysical,
    `Physical stock is UNTOUCHED (${afterReport1Section.physical_stock} === ${initialPhysical})`
  );
  assert(
    afterReport1Section.reserved_stock === initialReserved + 3,
    `Reserved stock increased by 3 (${afterReport1Section.reserved_stock} === ${initialReserved + 3})`
  );
  assert(
    afterReport1Section.available_stock === initialAvailable - 3,
    `Available stock decreased by 3 (${afterReport1Section.available_stock} === ${initialAvailable - 3})`
  );

  // --------------------------------------------------------------------------
  // TEST 2: Multiple Pending Reports Against the Same Stock
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Multiple Pending Reports Against Same Stock ---');
  const report2Res = await submitDamageReport({
    staff_id: 'demo-staff-003',
    staff_name: 'Babatunde Adeleke',
    section_id: 'sec-1',
    quantity: 2,
    damage_type: 'stain',
    description: 'Black oil stain on lower back hem',
  });

  assert(report2Res.success, 'Damage report 2 submitted successfully');
  const report2 = report2Res.data!;
  assert(report2.status === 'pending', 'Damage report 2 status is pending');

  const afterReport2Section = localInventoryStore.sections.find((s) => s.id === 'sec-1')!;
  assert(
    afterReport2Section.physical_stock === initialPhysical,
    `Physical stock still UNTOUCHED (${afterReport2Section.physical_stock} === ${initialPhysical})`
  );
  assert(
    afterReport2Section.reserved_stock === initialReserved + 5,
    `Cumulative reserved stock increased by 5 (${afterReport2Section.reserved_stock} === ${initialReserved + 5})`
  );
  assert(
    afterReport2Section.available_stock === initialAvailable - 5,
    `Available stock decreased cumulatively by 5 (${afterReport2Section.available_stock} === ${initialAvailable - 5})`
  );

  // --------------------------------------------------------------------------
  // TEST 3: Over-Reporting & Negative Availability Prevention
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Over-Reporting & Negative Availability Prevention ---');
  const currentAvailable = afterReport2Section.available_stock;
  const excessiveQuantity = currentAvailable + 10;

  const overReportRes = await submitDamageReport({
    staff_id: 'demo-staff-002',
    staff_name: 'Chidinma Eze',
    section_id: 'sec-1',
    quantity: excessiveQuantity,
    damage_type: 'burn',
    description: 'Excessive reporting test',
  });

  assert(!overReportRes.success, 'Over-reporting submission was correctly BLOCKED');
  assert(
    Boolean(overReportRes.error && overReportRes.error.includes('available for sale')),
    `Error clearly states available stock limit: "${overReportRes.error}"`
  );

  const sectionAfterOverReport = localInventoryStore.sections.find((s) => s.id === 'sec-1')!;
  assert(
    sectionAfterOverReport.available_stock === currentAvailable,
    'Available stock remains completely unchanged after blocked over-report attempt'
  );
  assert(sectionAfterOverReport.available_stock >= 0, 'Available stock is non-negative');

  // --------------------------------------------------------------------------
  // TEST 4: Unauthorized Review Prevention
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Unauthorized Review Prevention (Staff attempting review) ---');
  const unauthorizedRes = await reviewDamageReport({
    report_id: report1.id,
    reviewer_id: 'demo-staff-002',
    reviewer_name: 'Chidinma Eze',
    reviewer_role: 'staff', // Staff cannot review!
    action: 'approve',
  });

  assert(!unauthorizedRes.success, 'Staff review attempt was BLOCKED');
  assert(
    Boolean(unauthorizedRes.error && unauthorizedRes.error.includes('Unauthorized')),
    `Error message verifies authorization failure: "${unauthorizedRes.error}"`
  );

  // --------------------------------------------------------------------------
  // TEST 5: Rejection Flow (Requires Reason & Releases Reservation)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Rejection Flow (Mandatory Reason & Stock Release) ---');

  // 5a. Rejection without reason must fail
  const rejectNoReasonRes = await reviewDamageReport({
    report_id: report2.id,
    reviewer_id: 'demo-owner-001',
    reviewer_name: 'Olumide Oladipo',
    reviewer_role: 'super_admin',
    action: 'reject',
    rejection_reason: '', // Missing reason
  });
  assert(!rejectNoReasonRes.success, 'Rejection without reason was BLOCKED');
  assert(
    Boolean(rejectNoReasonRes.error && rejectNoReasonRes.error.includes('reason is mandatory')),
    `Error confirms mandatory rejection reason: "${rejectNoReasonRes.error}"`
  );

  // 5b. Rejection with reason succeeds and releases reservation
  const rejectSuccessRes = await reviewDamageReport({
    report_id: report2.id,
    reviewer_id: 'demo-owner-001',
    reviewer_name: 'Olumide Oladipo',
    reviewer_role: 'super_admin',
    action: 'reject',
    rejection_reason: 'Stain was spot-treated and washed successfully on floor.',
  });
  assert(rejectSuccessRes.success, 'Damage report 2 rejected successfully with reason');
  assert(rejectSuccessRes.data!.status === 'rejected', 'Report 2 status is now rejected');

  const afterRejectSection = localInventoryStore.sections.find((s) => s.id === 'sec-1')!;
  assert(
    afterRejectSection.reserved_stock === initialReserved + 3,
    `Reserved stock dropped from 5 to 3 (${afterRejectSection.reserved_stock})`
  );
  assert(
    afterRejectSection.available_stock === initialAvailable - 3,
    `Available stock RESTORED by 2 pieces (${afterRejectSection.available_stock})`
  );
  assert(
    afterRejectSection.physical_stock === initialPhysical,
    `Physical stock remained untouched throughout rejection (${afterRejectSection.physical_stock})`
  );

  // --------------------------------------------------------------------------
  // TEST 6: Approval Flow (Atomically Deducts Physical Stock Exactly Once)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Approval Flow (Atomic Physical Deduction & Movement) ---');
  const movementsBeforeApproval = localInventoryStore.movements.length;

  const approveRes = await reviewDamageReport({
    report_id: report1.id,
    reviewer_id: 'demo-owner-001',
    reviewer_name: 'Olumide Oladipo',
    reviewer_role: 'super_admin',
    action: 'approve',
  });
  assert(approveRes.success, 'Damage report 1 approved successfully by Super Admin');
  assert(approveRes.data!.status === 'approved', 'Report 1 status is now approved');

  // Check inventory movement was logged
  assert(
    localInventoryStore.movements.length === movementsBeforeApproval + 1,
    'Exactly one new inventory_movement was logged'
  );
  const createdMovement = localInventoryStore.movements[0];
  assert(createdMovement.movement_type === 'damage_deduction', 'Movement type is damage_deduction');
  assert(createdMovement.quantity_change === -3, 'Movement quantity_change is -3');
  assert(createdMovement.reference_id === report1.id, 'Movement references report1 ID');

  const afterApproveSection = localInventoryStore.sections.find((s) => s.id === 'sec-1')!;
  assert(
    afterApproveSection.physical_stock === initialPhysical - 3,
    `Physical stock was permanently deducted by 3 (${afterApproveSection.physical_stock} === ${initialPhysical - 3})`
  );
  assert(
    afterApproveSection.reserved_stock === initialReserved,
    `Reservation for report 1 was cleared (${afterApproveSection.reserved_stock} === ${initialReserved})`
  );
  assert(
    afterApproveSection.available_stock === initialAvailable - 3,
    `Available stock maintained consistency without double deduction (${afterApproveSection.available_stock})`
  );

  // --------------------------------------------------------------------------
  // TEST 7: Duplicate Review & Concurrent Review Prevention
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 7: Duplicate Review & Concurrent Review Prevention ---');
  // Attempt to re-approve report 1
  const duplicateApproveRes = await reviewDamageReport({
    report_id: report1.id,
    reviewer_id: 'demo-owner-001',
    reviewer_name: 'Olumide Oladipo',
    reviewer_role: 'super_admin',
    action: 'approve',
  });
  assert(!duplicateApproveRes.success, 'Duplicate review attempt on report 1 was BLOCKED');
  assert(
    Boolean(duplicateApproveRes.error && duplicateApproveRes.error.includes('already been reviewed')),
    `Error confirms duplicate review block: "${duplicateApproveRes.error}"`
  );

  // Attempt to re-reject report 2
  const duplicateRejectRes = await reviewDamageReport({
    report_id: report2.id,
    reviewer_id: 'demo-owner-001',
    reviewer_name: 'Olumide Oladipo',
    reviewer_role: 'super_admin',
    action: 'reject',
    rejection_reason: 'Second rejection attempt',
  });
  assert(!duplicateRejectRes.success, 'Duplicate review attempt on report 2 was BLOCKED');
  assert(
    Boolean(duplicateRejectRes.error && duplicateRejectRes.error.includes('already been reviewed')),
    `Error confirms duplicate review block: "${duplicateRejectRes.error}"`
  );

  // --------------------------------------------------------------------------
  // TEST 8: Validation Edge Cases (Zero/Negative quantity, missing description)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Validation Edge Cases ---');
  const zeroQtyRes = await submitDamageReport({
    staff_id: 'demo-staff-002',
    section_id: 'sec-1',
    quantity: 0,
    damage_type: 'other',
    description: 'Zero quantity test',
  });
  assert(!zeroQtyRes.success, 'Zero quantity submission was BLOCKED');

  const emptyDescRes = await submitDamageReport({
    staff_id: 'demo-staff-002',
    section_id: 'sec-1',
    quantity: 1,
    damage_type: 'other',
    description: '   ',
  });
  assert(!emptyDescRes.success, 'Empty description submission was BLOCKED');

  console.log('\n======================================================');
  console.log('🎉 ALL PHASE 4 DAMAGE REPORTING & REVIEW TESTS PASSED!');
  console.log('======================================================\n');
}

runPhase4Tests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
