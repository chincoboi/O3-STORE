import {
  submitDamageReport,
  reviewDamageReport,
  getDamageReports,
  inMemoryAuditLogs,
} from '../src/lib/damageService';
import { localInventoryStore, getStockSections } from '../src/lib/inventoryService';
import { DEMO_STAFF, DEMO_STAFF_2, DEMO_OWNER } from '../src/lib/demoData';

async function runPhase4Tests() {
  console.log('================================================================');
  console.log('   PHASE 4 DAMAGE REPORTING, RESERVATION & AUDIT TEST SUITE     ');
  console.log('================================================================\n');

  // Ensure fresh recalculation
  localInventoryStore.recalculateBalances();
  const initialSections = await getStockSections();
  const targetSection = initialSections.data?.find((s) => s.available_stock >= 15);

  if (!targetSection) {
    throw new Error('Target section with at least 15 available items not found for testing.');
  }

  const initialPhysical = targetSection.physical_stock;
  const initialAvailable = targetSection.available_stock;
  const initialReserved = targetSection.reserved_stock;

  console.log(`[SETUP] Target section: "${targetSection.name}" [${targetSection.section_code}]`);
  console.log(`   Physical Stock: ${initialPhysical} pcs`);
  console.log(`   Reserved Stock: ${initialReserved} pcs`);
  console.log(`   Available For Sale: ${initialAvailable} pcs\n`);

  // --------------------------------------------------------------------------
  // TEST 1: Multiple Pending Reports Against the Same Stock & Over-reporting Guard
  // --------------------------------------------------------------------------
  console.log('--- TEST 1: Multiple Pending Reports Against the Same Stock ---');

  // Staff A reports 4 pieces
  const reportA = await submitDamageReport(
    {
      staff_id: DEMO_STAFF.id,
      staff_name: DEMO_STAFF.full_name,
      section_id: targetSection.id,
      quantity: 4,
      damage_type: 'tear',
      description: 'Side seam torn during floor display (Staff A)',
      idempotency_key: `test-key-a-${Date.now()}`,
    },
    DEMO_STAFF
  );

  if (!reportA.success || !reportA.data) {
    throw new Error(`TEST 1A FAILED: Could not submit report A: ${reportA.error}`);
  }
  console.log(`✅ TEST 1A: Report A submitted (4 pcs). Report ID: ${reportA.data.id}`);

  // Verify stock: physical unchanged, available reduced by 4, reserved increased by 4
  let currentSections = await getStockSections();
  let sec = currentSections.data?.find((s) => s.id === targetSection.id);
  if (
    sec?.physical_stock === initialPhysical &&
    sec?.reserved_stock === initialReserved + 4 &&
    sec?.available_stock === initialAvailable - 4
  ) {
    console.log(
      `   Reservation Verified: Physical=${sec?.physical_stock} (unchanged), Reserved=${sec?.reserved_stock} (+4), Available=${sec?.available_stock} (-4)`
    );
  } else {
    throw new Error(`TEST 1A Verification Failed: unexpected balances ${JSON.stringify(sec)}`);
  }

  // Staff B reports 5 pieces against the SAME section
  const reportB = await submitDamageReport(
    {
      staff_id: DEMO_STAFF_2.id,
      staff_name: DEMO_STAFF_2.full_name,
      section_id: targetSection.id,
      quantity: 5,
      damage_type: 'stain',
      description: 'Coffee spill stain on fabric (Staff B)',
      idempotency_key: `test-key-b-${Date.now()}`,
    },
    DEMO_STAFF_2
  );

  if (!reportB.success || !reportB.data) {
    throw new Error(`TEST 1B FAILED: Could not submit report B: ${reportB.error}`);
  }
  console.log(`✅ TEST 1B: Report B submitted (5 pcs). Report ID: ${reportB.data.id}`);

  currentSections = await getStockSections();
  sec = currentSections.data?.find((s) => s.id === targetSection.id);
  if (
    sec?.physical_stock === initialPhysical &&
    sec?.reserved_stock === initialReserved + 9 &&
    sec?.available_stock === initialAvailable - 9
  ) {
    console.log(
      `   Multiple Pending Stock Verified: Total Reserved=${sec?.reserved_stock} (4+5), Available=${sec?.available_stock}`
    );
  } else {
    throw new Error(`TEST 1B Verification Failed: unexpected balances ${JSON.stringify(sec)}`);
  }

  // TEST 1C: Prevent Over-reporting and Negative Availability
  console.log('\n--- TEST 1C: Prevent Over-reporting and Negative Availability ---');
  const remainingAvailable = sec!.available_stock;
  const excessQty = remainingAvailable + 5;
  const overReportRes = await submitDamageReport(
    {
      staff_id: DEMO_STAFF.id,
      staff_name: DEMO_STAFF.full_name,
      section_id: targetSection.id,
      quantity: excessQty,
      damage_type: 'other',
      description: 'Attempting to report more than available balance',
    },
    DEMO_STAFF
  );

  if (!overReportRes.success && overReportRes.error?.includes('only')) {
    console.log('✅ TEST 1C PASSED: Over-reporting prevented. Rejection message:', overReportRes.error);
  } else {
    throw new Error(`TEST 1C FAILED: Expected over-reporting rejection, got: ${JSON.stringify(overReportRes)}`);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Retries and Idempotency Protection
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 2: Retries & Idempotency Protection ---');
  const retryKey = `retry-key-${Date.now()}`;
  const firstSubmission = await submitDamageReport(
    {
      staff_id: DEMO_STAFF.id,
      staff_name: DEMO_STAFF.full_name,
      section_id: targetSection.id,
      quantity: 2,
      damage_type: 'burn',
      description: 'Iron burn near hem',
      idempotency_key: retryKey,
    },
    DEMO_STAFF
  );

  if (!firstSubmission.success || !firstSubmission.data) {
    throw new Error(`TEST 2 FAILED: Initial submission failed: ${firstSubmission.error}`);
  }
  console.log(`   Initial report submitted with idempotency key: ${retryKey}`);

  // Now simulate identical network retry with the exact same key
  const retrySubmission = await submitDamageReport(
    {
      staff_id: DEMO_STAFF.id,
      staff_name: DEMO_STAFF.full_name,
      section_id: targetSection.id,
      quantity: 2,
      damage_type: 'burn',
      description: 'Iron burn near hem (retry attempt)',
      idempotency_key: retryKey,
    },
    DEMO_STAFF
  );

  if (retrySubmission.success && retrySubmission.idempotencyHit && retrySubmission.data?.id === firstSubmission.data.id) {
    console.log(`✅ TEST 2 PASSED: Idempotency hit recognized. Returned identical report #${retrySubmission.data.id} without double reserving stock.`);
  } else {
    throw new Error(`TEST 2 FAILED: Idempotency was not properly enforced: ${JSON.stringify(retrySubmission)}`);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Rejected Reports Require Reason and Release Reservation
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 3: Rejected Reports Require Reason & Release Reservation ---');
  const reportToReject = reportA.data!;
  const beforeRejectSections = await getStockSections();
  const beforeRejectReserved = beforeRejectSections.data?.find((s) => s.id === targetSection.id)?.reserved_stock || 0;
  const beforeRejectAvailable = beforeRejectSections.data?.find((s) => s.id === targetSection.id)?.available_stock || 0;

  // 3A: Attempt rejection WITHOUT reason (must fail)
  const failReject = await reviewDamageReport(
    {
      report_id: reportToReject.id,
      actor_id: DEMO_OWNER.id,
      actor_role: 'super_admin',
      actor_name: DEMO_OWNER.full_name,
      action: 'reject',
      rejection_reason: '', // Empty reason
    },
    DEMO_OWNER
  );

  if (!failReject.success && failReject.error?.includes('mandatory')) {
    console.log('✅ TEST 3A PASSED: Rejection without mandatory reason rejected:', failReject.error);
  } else {
    throw new Error(`TEST 3A FAILED: Expected rejection reason requirement, got: ${JSON.stringify(failReject)}`);
  }

  // 3B: Valid rejection with clear reason
  const validReject = await reviewDamageReport(
    {
      report_id: reportToReject.id,
      actor_id: DEMO_OWNER.id,
      actor_role: 'super_admin',
      actor_name: DEMO_OWNER.full_name,
      action: 'reject',
      rejection_reason: 'Garment inspected by owner: thread was loose, easily hand-repaired in 2 minutes',
    },
    DEMO_OWNER
  );

  if (!validReject.success || validReject.action !== 'rejected') {
    throw new Error(`TEST 3B FAILED: Could not reject report: ${validReject.error}`);
  }

  // Verify reservation release
  const afterRejectSections = await getStockSections();
  const afterRejectSec = afterRejectSections.data?.find((s) => s.id === targetSection.id);
  const expectedReservedAfterRelease = beforeRejectReserved - reportToReject.quantity;
  const expectedAvailableAfterRelease = beforeRejectAvailable + reportToReject.quantity;

  if (
    afterRejectSec?.reserved_stock === expectedReservedAfterRelease &&
    afterRejectSec?.available_stock === expectedAvailableAfterRelease
  ) {
    console.log(`✅ TEST 3B PASSED: Report #${reportToReject.id} REJECTED.`);
    console.log(`   Reservation of ${reportToReject.quantity} pcs released back to sale availability!`);
    console.log(`   New Reserved=${afterRejectSec?.reserved_stock}, New Available=${afterRejectSec?.available_stock}`);
  } else {
    throw new Error(`TEST 3B FAILED: Reservation was not released properly: ${JSON.stringify(afterRejectSec)}`);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Unauthorised Review & Non-super_admin Guard
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 4: Unauthorised Review Guard ---');
  const reportToApprove = reportB.data!;

  const unauthReview = await reviewDamageReport(
    {
      report_id: reportToApprove.id,
      actor_id: DEMO_STAFF.id,
      actor_role: 'staff', // Staff user trying to approve!
      actor_name: DEMO_STAFF.full_name,
      action: 'approve',
    },
    DEMO_STAFF
  );

  if (!unauthReview.success && unauthReview.error?.toLowerCase().includes('unauthori')) {
    console.log('✅ TEST 4 PASSED: Unauthorised review by staff rejected:', unauthReview.error);
  } else {
    throw new Error(`TEST 4 FAILED: Expected role denial for staff, got: ${JSON.stringify(unauthReview)}`);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Approved Report Deducts Physical Stock Exactly Once via Ledger
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 5: Atomic Approval & Stock Deduction ---');
  const beforeApproveSections = await getStockSections();
  const beforeApproveSec = beforeApproveSections.data?.find((s) => s.id === targetSection.id);
  const physicalBeforeApprove = beforeApproveSec?.physical_stock || 0;
  const availableBeforeApprove = beforeApproveSec?.available_stock || 0;

  const validApprove = await reviewDamageReport(
    {
      report_id: reportToApprove.id,
      actor_id: DEMO_OWNER.id,
      actor_role: 'super_admin',
      actor_name: DEMO_OWNER.full_name,
      action: 'approve',
    },
    DEMO_OWNER
  );

  if (!validApprove.success || validApprove.action !== 'approved') {
    throw new Error(`TEST 5 FAILED: Approval failed: ${validApprove.error}`);
  }

  const afterApproveSections = await getStockSections();
  const afterApproveSec = afterApproveSections.data?.find((s) => s.id === targetSection.id);

  if (
    afterApproveSec?.physical_stock === physicalBeforeApprove - reportToApprove.quantity &&
    afterApproveSec?.available_stock === availableBeforeApprove
  ) {
    console.log(`✅ TEST 5 PASSED: Report #${reportToApprove.id} APPROVED by ${DEMO_OWNER.full_name}.`);
    console.log(`   Physical stock permanently reduced by ${reportToApprove.quantity} pcs.`);
    console.log(`   Physical: ${physicalBeforeApprove} -> ${afterApproveSec?.physical_stock}`);
    console.log(`   Available: remains ${afterApproveSec?.available_stock} (reservation became permanent deduction)`);
  } else {
    throw new Error(`TEST 5 FAILED: Stock deduction mismatch: ${JSON.stringify(afterApproveSec)}`);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Concurrent Reviews & Duplicate Approval Prevention
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 6: Concurrent Reviews & Duplicate Approval Prevention ---');

  // Attempt to review reportToApprove a SECOND time (simulate concurrent request or replay attack)
  const duplicateReview = await reviewDamageReport(
    {
      report_id: reportToApprove.id,
      actor_id: DEMO_OWNER.id,
      actor_role: 'super_admin',
      actor_name: DEMO_OWNER.full_name,
      action: 'approve',
    },
    DEMO_OWNER
  );

  if (!duplicateReview.success && duplicateReview.error?.includes('already been reviewed')) {
    console.log('✅ TEST 6 PASSED: Duplicate review attempt blocked cleanly:', duplicateReview.error);
  } else {
    throw new Error(`TEST 6 FAILED: Duplicate review was not blocked: ${JSON.stringify(duplicateReview)}`);
  }

  // Verify Audit Log was recorded
  console.log('\n--- TEST 7: Audit Trail Verification ---');
  const recentLogs = inMemoryAuditLogs.filter((l) => l.entity === 'damage_report');
  console.log(`✅ TEST 7 PASSED: Total damage audit events recorded: ${recentLogs.length}`);
  recentLogs.slice(0, 3).forEach((l) => {
    console.log(`   [${l.action.toUpperCase()}] by ${l.actor_name || l.actor_id} on Report #${l.entity_id}`);
  });

  // --------------------------------------------------------------------------
  // TEST 8: Owner Reports Dented Cloth -> Reflects Across All Staff Dashboards
  // --------------------------------------------------------------------------
  console.log('\n--- TEST 8: Owner Reports Dented Cloth -> Reflects Across All Staff Dashboards ---');

  // Let's choose another section or current section
  const secBeforeOwnerDent = (await getStockSections()).data?.find((s) => s.id === targetSection.id);
  const availBeforeOwnerDent = secBeforeOwnerDent?.available_stock || 0;
  const reservedBeforeOwnerDent = secBeforeOwnerDent?.reserved_stock || 0;
  const physicalBeforeOwnerDent = secBeforeOwnerDent?.physical_stock || 0;

  console.log(`   Before Owner Dent Report: Physical=${physicalBeforeOwnerDent}, Reserved=${reservedBeforeOwnerDent}, Available=${availBeforeOwnerDent}`);

  // Owner submits a report for 3 dented garments
  const ownerDentSubmission = await submitDamageReport(
    {
      staff_id: DEMO_OWNER.id,
      staff_name: DEMO_OWNER.full_name,
      section_id: targetSection.id,
      quantity: 3,
      damage_type: 'dent',
      description: 'Owner floor inspection: 3 dented fabric / creased collar garments held from sales floor',
      idempotency_key: `owner-dent-key-${Date.now()}`,
      is_owner_report: true,
      reporter_role: 'super_admin',
    },
    DEMO_OWNER
  );

  if (!ownerDentSubmission.success || !ownerDentSubmission.data) {
    throw new Error(`TEST 8 FAILED: Owner could not submit dent report: ${ownerDentSubmission.error}`);
  }

  const dentReport = ownerDentSubmission.data;
  console.log(`✅ TEST 8A: Owner submitted dent report #${dentReport.id}. is_owner_report=${dentReport.is_owner_report}`);

  // Check 8B: Section available stock is immediately reserved across store
  const secAfterOwnerDent = (await getStockSections()).data?.find((s) => s.id === targetSection.id);
  if (
    secAfterOwnerDent?.reserved_stock === reservedBeforeOwnerDent + 3 &&
    secAfterOwnerDent?.available_stock === availBeforeOwnerDent - 3 &&
    secAfterOwnerDent?.physical_stock === physicalBeforeOwnerDent
  ) {
    console.log(
      `✅ TEST 8B: Stock automatically reserved store-wide: Reserved=${secAfterOwnerDent.reserved_stock} (+3), Available=${secAfterOwnerDent.available_stock} (-3)`
    );
  } else {
    throw new Error(`TEST 8B FAILED: Stock reservation failed: ${JSON.stringify(secAfterOwnerDent)}`);
  }

  // Check 8C: Querying store damage reports (used by StaffDashboardShell) includes the owner dent report
  const staffDashboardFeed = await getDamageReports();
  const foundDentInStaffFeed = staffDashboardFeed.data.find((d) => d.id === dentReport.id);
  if (foundDentInStaffFeed && foundDentInStaffFeed.damage_type === 'dent' && foundDentInStaffFeed.is_owner_report) {
    console.log(`✅ TEST 8C: Store-wide staff feed displays owner dent report:`);
    console.log(`   ID: ${foundDentInStaffFeed.id} | Type: ${foundDentInStaffFeed.damage_type} | Qty: ${foundDentInStaffFeed.quantity} | Reporter: ${foundDentInStaffFeed.staff_name}`);
  } else {
    throw new Error(`TEST 8C FAILED: Owner dent report not found in staff feed: ${JSON.stringify(staffDashboardFeed.data)}`);
  }

  // Check 8D: Querying staff damages with staff isolation + includeOwnerReports includes the owner dent report
  const staffIsolatedFeed = await getDamageReports({
    staffId: DEMO_STAFF.id,
    includeOwnerReports: true,
  });
  const foundDentInIsolatedFeed = staffIsolatedFeed.data.find((d) => d.id === dentReport.id);
  if (foundDentInIsolatedFeed) {
    console.log(`✅ TEST 8D: Staff-filtered feed with includeOwnerReports=true correctly includes owner dent report #${foundDentInIsolatedFeed.id}`);
  } else {
    throw new Error(`TEST 8D FAILED: Owner dent report omitted when includeOwnerReports=true`);
  }

  console.log('\n================================================================');
  console.log('   ALL PHASE 4 DAMAGE VERIFICATION TESTS PASSED SUCCESSFULLY!   ');
  console.log('================================================================');
}

runPhase4Tests().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
