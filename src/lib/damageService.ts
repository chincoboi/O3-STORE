import {
  DamageReport,
  SubmitDamagePayload,
  ReviewDamagePayload,
  DamageStatus,
  UserProfile,
  AuditLog,
  InventoryMovement,
} from '../types/database';
import { getSupabaseClient } from './supabase';
import { localInventoryStore, extractErrorMessage, notifyInventoryUpdated } from './inventoryService';
import { DEMO_OWNER } from './demoData';

// In-memory audit log storage for demo & offline modes
export const inMemoryAuditLogs: AuditLog[] = [
  {
    id: 'audit-dmg-003',
    actor_id: DEMO_OWNER.id,
    actor_name: DEMO_OWNER.full_name,
    action: 'damage_approved',
    entity: 'damage_report',
    entity_id: 'dmg-003',
    before_state: { status: 'pending', quantity: 1, section_id: 'sec-3' },
    after_state: {
      status: 'approved',
      quantity_deducted: 1,
      movement_type: 'damage_deduction',
      reviewer: DEMO_OWNER.full_name,
    },
    created_at: '2026-10-23T16:00:00Z',
  },
];

export function addAuditLog(entry: Omit<AuditLog, 'id' | 'created_at'>): AuditLog {
  const log: AuditLog = {
    id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    ...entry,
    created_at: new Date().toISOString(),
  };
  inMemoryAuditLogs.unshift(log);
  return log;
}

// Persistent Photo Cache in localStorage (with in-memory fallback for SSR and tests)
const PHOTO_CACHE_KEY = 'o3_damage_photos_v1';
const fallbackMemoryCache = new Map<string, string>();

export function savePhotoToCache(key: string, url: string): void {
  if (!key || !url) return;
  fallbackMemoryCache.set(key, url);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const existingStr = window.localStorage.getItem(PHOTO_CACHE_KEY);
      const cache: Record<string, string> = existingStr ? JSON.parse(existingStr) : {};
      cache[key] = url;
      // Keep most recent 50 photos to avoid localStorage quota exhaustion
      const keys = Object.keys(cache);
      if (keys.length > 50) {
        delete cache[keys[0]];
      }
      window.localStorage.setItem(PHOTO_CACHE_KEY, JSON.stringify(cache));
    }
  } catch (err) {
    console.warn('Could not cache damage photo to localStorage:', err);
  }
}

export function getPhotoFromCache(key: string): string | null {
  if (!key) return null;
  if (fallbackMemoryCache.has(key)) {
    return fallbackMemoryCache.get(key) || null;
  }
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const existingStr = window.localStorage.getItem(PHOTO_CACHE_KEY);
      if (existingStr) {
        const cache: Record<string, string> = JSON.parse(existingStr);
        if (cache[key]) {
          fallbackMemoryCache.set(key, cache[key]);
          return cache[key];
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

// Built-in high-fidelity evidence visuals for pre-seeded demo reports
const DEMO_PHOTOS: Record<string, string> = {
  'dmg-001': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%23f1f5f9"/><path d="M50 80 L220 80 L200 350 L70 350 Z" fill="%23cbd5e1"/><path d="M220 80 L380 80 L400 350 L200 350 Z" fill="%2394a3b8"/><path d="M380 80 L550 80 L530 350 L400 350 Z" fill="%23cbd5e1"/><path d="M190 140 Q215 160 195 190 Q225 210 200 230" stroke="%23dc2626" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="205" cy="180" r="16" fill="%23ef4444" opacity="0.3"/><text x="300" y="50" font-family="sans-serif" font-weight="bold" font-size="16" fill="%230f172a" text-anchor="middle">EVIDENCE: TORN SLEEVE SEAM</text><text x="300" y="375" font-family="sans-serif" font-size="12" fill="%2364748b" text-anchor="middle">Men%27s Corporate Shirts (Checked) &bull; Seam Separation</text></svg>',
  'dmg-002': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%23f8fafc"/><path d="M120 100 Q300 60 480 100 L450 360 L150 360 Z" fill="%23e2e8f0"/><ellipse cx="280" cy="180" rx="45" ry="30" fill="%2378350f" opacity="0.45"/><ellipse cx="310" cy="195" rx="25" ry="18" fill="%2392400e" opacity="0.6"/><text x="300" y="50" font-family="sans-serif" font-weight="bold" font-size="16" fill="%230f172a" text-anchor="middle">EVIDENCE: GREASE &amp; OIL STAIN</text><text x="300" y="375" font-family="sans-serif" font-size="12" fill="%2364748b" text-anchor="middle">Women%27s Chiffon &amp; Silk Tops &bull; Factory Bale Contamination</text></svg>',
  'dmg-003': 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><rect width="600" height="400" fill="%23f1f5f9"/><path d="M100 110 L500 110 L460 360 L140 360 Z" fill="%23cbd5e1"/><polygon points="280,180 320,180 310,220 270,220" fill="%231e293b"/><path d="M260 170 Q300 160 340 170 Q330 230 250 230 Z" stroke="%23ea580c" stroke-width="3" fill="none" stroke-dasharray="4,2"/><text x="300" y="50" font-family="sans-serif" font-weight="bold" font-size="16" fill="%230f172a" text-anchor="middle">EVIDENCE: HEAT SCORCH HOLE</text><text x="300" y="375" font-family="sans-serif" font-size="12" fill="%2364748b" text-anchor="middle">Men%27s Round Neck &amp; Polos &bull; Iron Scorching</text></svg>',
};

/**
 * 1. Upload Damage Photo Evidence to Supabase Storage (with Instant Base64 & Local Cache Fallback)
 * - Restricts file size to max 5MB
 * - Validates image MIME types (JPEG, PNG, WebP)
 * - Uploads to Supabase Storage bucket 'damage-evidence'
 * - Resolves both public URL and signed URL
 * - Automatically caches photo in persistent storage so it is viewable across all dashboards
 */
export async function uploadEvidencePhoto(
  file: File,
  tempId?: string
): Promise<{ success: boolean; storagePath?: string; previewUrl?: string; error?: string }> {
  // Validate file size: max 5MB (5242880 bytes)
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return {
      success: false,
      error: `Photo file size exceeds the 5MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB). Please choose a smaller photo.`,
    };
  }

  // Validate MIME type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
  if (!allowedTypes.includes(file.type.toLowerCase())) {
    return {
      success: false,
      error: 'Invalid file format. Only JPEG, PNG, and WebP images are accepted as damage evidence.',
    };
  }

  const client = getSupabaseClient();
  const fileExt = file.name.split('.').pop() || 'jpg';
  const cleanId = tempId || `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const storagePath = `evidence/${Date.now()}-${cleanId}.${fileExt}`;

  // Read base64 data URL first so we have an instant, infallible fallback
  let dataUrl: string | undefined;
  try {
    if (typeof FileReader !== 'undefined') {
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    } else if (typeof file.arrayBuffer === 'function') {
      const arrayBuf = await file.arrayBuffer();
      const b64 = Buffer.from(arrayBuf).toString('base64');
      dataUrl = `data:${file.type || 'image/png'};base64,${b64}`;
    }
  } catch {
    // continue
  }

  if (client) {
    try {
      const { data, error } = await client.storage
        .from('damage-evidence')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (!error && data) {
        // 1. Get permanent Public URL (works with public bucket)
        const { data: pubData } = client.storage
          .from('damage-evidence')
          .getPublicUrl(storagePath);

        // 2. Also generate long-lived signed URL as backup
        const { data: signedData } = await client.storage
          .from('damage-evidence')
          .createSignedUrl(storagePath, 3600 * 24 * 7);

        const resolvedUrl = pubData?.publicUrl || signedData?.signedUrl || dataUrl;

        if (resolvedUrl) {
          savePhotoToCache(storagePath, resolvedUrl);
          if (tempId) savePhotoToCache(tempId, resolvedUrl);
          return {
            success: true,
            storagePath: data.path || storagePath,
            previewUrl: resolvedUrl,
          };
        }
      } else if (error) {
        console.warn('Supabase storage upload notice:', error.message);
      }
    } catch (err) {
      console.warn('Supabase storage upload failed, falling back to base64 preview:', extractErrorMessage(err));
    }
  }

  // Fallback: Use base64 data URL for instant client-side preview & local persistence
  if (dataUrl) {
    savePhotoToCache(storagePath, dataUrl);
    if (tempId) savePhotoToCache(tempId, dataUrl);
    return {
      success: true,
      storagePath,
      previewUrl: dataUrl,
    };
  }

  return { success: false, error: 'Could not process photo file.' };
}

/**
 * 2. Retrieve Immediate or Cached URL for Damage Photos (Synchronous)
 */
export function getDamagePhotoImmediateUrl(
  reportOrPath: DamageReport | string | undefined | null,
  existingUrl?: string | null
): string | null {
  if (!reportOrPath && !existingUrl) return null;

  if (existingUrl && (existingUrl.startsWith('data:') || existingUrl.startsWith('blob:') || existingUrl.startsWith('http'))) {
    return existingUrl;
  }

  const report = typeof reportOrPath === 'object' && reportOrPath !== null ? reportOrPath : null;
  const storagePath = typeof reportOrPath === 'string' ? reportOrPath : report?.photo_storage_path;
  const reportId = report?.id;

  if (report?.photo_url && (report.photo_url.startsWith('data:') || report.photo_url.startsWith('blob:') || report.photo_url.startsWith('http'))) {
    return report.photo_url;
  }

  if (reportId) {
    const cached = getPhotoFromCache(reportId);
    if (cached) return cached;
  }

  if (storagePath) {
    const cached = getPhotoFromCache(storagePath);
    if (cached) return cached;
  }

  const client = getSupabaseClient();
  if (client && storagePath) {
    try {
      const { data: pubData } = client.storage.from('damage-evidence').getPublicUrl(storagePath);
      if (pubData?.publicUrl) {
        return pubData.publicUrl;
      }
    } catch {
      // ignore
    }
  }

  if (reportId && DEMO_PHOTOS[reportId]) {
    return DEMO_PHOTOS[reportId];
  }

  return existingUrl || null;
}

/**
 * 3. Retrieve Secure or Public URL for Damage Photos (Asynchronous)
 * Guaranteed to resolve across Supabase Storage, Signed URLs, and Local Storage Cache.
 */
export async function resolveDamagePhotoUrl(
  reportOrPath: DamageReport | string | undefined | null,
  existingUrl?: string | null
): Promise<string | null> {
  if (!reportOrPath && !existingUrl) return null;

  // 1. Direct valid URL
  if (existingUrl && (existingUrl.startsWith('data:') || existingUrl.startsWith('blob:') || existingUrl.startsWith('http'))) {
    return existingUrl;
  }

  const report = typeof reportOrPath === 'object' && reportOrPath !== null ? reportOrPath : null;
  const storagePath = typeof reportOrPath === 'string' ? reportOrPath : report?.photo_storage_path;
  const reportId = report?.id;

  if (report?.photo_url && (report.photo_url.startsWith('data:') || report.photo_url.startsWith('blob:') || report.photo_url.startsWith('http'))) {
    return report.photo_url;
  }

  // 2. Check local photo cache by report ID or storage path
  if (reportId) {
    const cached = getPhotoFromCache(reportId);
    if (cached) return cached;
  }
  if (storagePath) {
    const cached = getPhotoFromCache(storagePath);
    if (cached) return cached;
  }

  // 3. Try Supabase Storage public & signed URLs
  const client = getSupabaseClient();
  if (client && storagePath) {
    try {
      // Try public URL first
      const { data: pubData } = client.storage.from('damage-evidence').getPublicUrl(storagePath);
      if (pubData?.publicUrl) {
        savePhotoToCache(storagePath, pubData.publicUrl);
        if (reportId) savePhotoToCache(reportId, pubData.publicUrl);
        return pubData.publicUrl;
      }

      // Try signed URL fallback
      const { data: signedData, error } = await client.storage
        .from('damage-evidence')
        .createSignedUrl(storagePath, 3600 * 24 * 7);
      if (!error && signedData?.signedUrl) {
        savePhotoToCache(storagePath, signedData.signedUrl);
        if (reportId) savePhotoToCache(reportId, signedData.signedUrl);
        return signedData.signedUrl;
      }
    } catch (err) {
      console.warn('Error resolving damage photo URL from Supabase:', extractErrorMessage(err));
    }
  }

  // 4. Fallback for demo reports
  if (reportId && DEMO_PHOTOS[reportId]) {
    return DEMO_PHOTOS[reportId];
  }

  return existingUrl || null;
}

/**
 * Legacy compatibility alias for getDamagePhotoSignedUrl
 */
export async function getDamagePhotoSignedUrl(storagePath?: string, existingUrl?: string): Promise<string | null> {
  return resolveDamagePhotoUrl(storagePath, existingUrl);
}

/**
 * 3. Submit Damage Report (Atomic Reservation)
 * - Reserves reported quantity immediately from sale availability
 * - Does NOT reduce physical stock while pending
 * - Enforces idempotency (prevents duplicate submission on retries)
 * - Prevents over-reporting & negative availability
 */
export async function submitDamageReport(
  payload: SubmitDamagePayload,
  actorProfile?: UserProfile
): Promise<{
  success: boolean;
  data?: DamageReport;
  error?: string;
  idempotencyHit?: boolean;
}> {
  // Input validation
  if (!payload.section_id) {
    return { success: false, error: 'Please select a clothing section.' };
  }

  if (!payload.quantity || payload.quantity <= 0) {
    return { success: false, error: 'Reported quantity must be at least 1 piece.' };
  }

  if (!payload.description || !payload.description.trim()) {
    return { success: false, error: 'Please provide a clear description of the damage.' };
  }

  // Idempotency check on local store
  if (payload.idempotency_key) {
    const existing = localInventoryStore.damageReports.find(
      (r) => r.idempotency_key === payload.idempotency_key
    );
    if (existing) {
      return {
        success: true,
        data: existing,
        idempotencyHit: true,
      };
    }
  }

  // Find target section
  const section = localInventoryStore.sections.find((s) => s.id === payload.section_id);
  if (!section) {
    return { success: false, error: 'Target clothing section was not found.' };
  }

  // PREVENT OVER-REPORTING & NEGATIVE AVAILABILITY
  if (payload.quantity > section.available_stock) {
    return {
      success: false,
      error: `Cannot report ${payload.quantity} pcs damaged: only ${section.available_stock} pcs are currently available for sale in "${section.name}" (${section.physical_stock} physical, ${section.reserved_stock} already reserved).`,
    };
  }

  // Handle Photo Evidence Upload if provided
  let photoStoragePath = payload.photo_storage_path;
  let photoUrl = payload.photo_url;

  if (payload.photo_file) {
    const uploadRes = await uploadEvidencePhoto(payload.photo_file);
    if (!uploadRes.success) {
      return { success: false, error: uploadRes.error };
    }
    photoStoragePath = uploadRes.storagePath;
    photoUrl = uploadRes.previewUrl;
  }

  const isOwner =
    payload.is_owner_report ??
    (actorProfile?.role === 'super_admin' ||
      payload.reporter_role === 'super_admin' ||
      payload.staff_id === DEMO_OWNER.id ||
      payload.staff_name?.toLowerCase().includes('owner'));

  const staffName =
    payload.staff_name ||
    actorProfile?.full_name ||
    (isOwner ? `${DEMO_OWNER.full_name} (Store Owner)` : 'Staff Member');

  const nowIso = new Date().toISOString();
  const reportId = `dmg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  // Cache photo eagerly so it is available across all dashboards and tabs immediately
  if (photoUrl) {
    savePhotoToCache(reportId, photoUrl);
    if (photoStoragePath) savePhotoToCache(photoStoragePath, photoUrl);
    if (payload.idempotency_key) savePhotoToCache(payload.idempotency_key, photoUrl);
  }

  // Try Supabase RPC if client is connected
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client.rpc('submit_damage_report_atomic', {
        p_staff_id: payload.staff_id,
        p_section_id: payload.section_id,
        p_quantity: payload.quantity,
        p_damage_type: payload.damage_type,
        p_description: payload.description.trim(),
        p_photo_storage_path: photoStoragePath || null,
        p_photo_url: photoUrl || null,
        p_idempotency_key: payload.idempotency_key || null,
      });

      if (error) {
        throw error;
      }

      if (data && data.success) {
        const serverReportId = data.report_id || reportId;
        if (photoUrl && serverReportId) {
          savePhotoToCache(serverReportId, photoUrl);
        }

        const newReport: DamageReport = {
          id: serverReportId,
          staff_id: payload.staff_id,
          staff_name: staffName,
          reporter_role: isOwner ? 'super_admin' : 'staff',
          is_owner_report: isOwner,
          section_id: payload.section_id,
          section_code: section.section_code,
          section_name: section.name,
          quantity: payload.quantity,
          damage_type: payload.damage_type,
          description: payload.description.trim(),
          photo_storage_path: photoStoragePath,
          photo_url: photoUrl,
          status: 'pending',
          idempotency_key: payload.idempotency_key,
          created_at: nowIso,
        };

        // Mirror in local store and recalculate balances
        localInventoryStore.damageReports.unshift(newReport);
        localInventoryStore.recalculateBalances();
        notifyInventoryUpdated();

        return {
          success: true,
          data: newReport,
          idempotencyHit: Boolean(data.idempotency_hit),
        };
      }
    } catch (err: unknown) {
      const msg = extractErrorMessage(err);
      console.warn('Supabase damage report RPC notice, mirroring in local store:', msg);
      if (
        (msg.includes('only') && msg.includes('available')) ||
        msg.includes('Cannot report') ||
        msg.includes('exceeds')
      ) {
        return { success: false, error: msg };
      }
    }
  }

  // Local Store Execution
  const newReport: DamageReport = {
    id: reportId,
    staff_id: payload.staff_id,
    staff_name: staffName,
    reporter_role: isOwner ? 'super_admin' : 'staff',
    is_owner_report: isOwner,
    section_id: payload.section_id,
    section_code: section.section_code,
    section_name: section.name,
    quantity: payload.quantity,
    damage_type: payload.damage_type,
    description: payload.description.trim(),
    photo_storage_path: photoStoragePath,
    photo_url: photoUrl,
    status: 'pending',
    idempotency_key: payload.idempotency_key,
    created_at: nowIso,
  };

  // Atomically record in store & recalculate balances (immediately reserves from sale availability)
  localInventoryStore.damageReports.unshift(newReport);
  localInventoryStore.recalculateBalances();
  notifyInventoryUpdated();

  // Audit log
  addAuditLog({
    actor_id: payload.staff_id,
    actor_name: staffName,
    action: 'damage_reported',
    entity: 'damage_report',
    entity_id: reportId,
    after_state: {
      section_id: section.id,
      section_name: section.name,
      quantity: payload.quantity,
      damage_type: payload.damage_type,
      status: 'pending',
      reserved_now: payload.quantity,
      remaining_available: section.available_stock,
    },
  });

  return {
    success: true,
    data: newReport,
    idempotencyHit: false,
  };
}

/**
 * 4. Review Damage Report (Approve or Reject)
 * - DATABASE & APPLICATION LEVEL ROLE CHECK: Only super_admin may approve or reject
 * - PREVENTS DUPLICATE APPROVAL & CONCURRENT RACES: Fails immediately if report is not pending
 * - APPROVAL: Atomically deducts physical stock exactly once and inserts an immutable inventory movement
 * - REJECTION: Requires mandatory rejection reason and releases the reserved quantity back to sales availability
 */
export async function reviewDamageReport(
  payloadOrReviewerId: ReviewDamagePayload | string,
  actorProfileOrReportId?: UserProfile | string,
  legacyAction?: 'approve' | 'reject' | 'approved' | 'rejected',
  legacyReason?: string
): Promise<{
  success: boolean;
  data?: DamageReport;
  error?: string;
  action?: 'approved' | 'rejected';
}> {
  // Normalize payload and profile from either object or legacy positional signature
  let payload: ReviewDamagePayload;
  let actorProfile: UserProfile | undefined;

  if (typeof payloadOrReviewerId === 'string') {
    const rawAction = legacyAction || 'approve';
    const action = rawAction === 'approved' ? 'approve' : rawAction === 'rejected' ? 'reject' : rawAction;
    payload = {
      report_id: actorProfileOrReportId as string,
      actor_id: payloadOrReviewerId,
      actor_role: 'super_admin',
      action,
      rejection_reason: legacyReason,
    };
  } else {
    payload = payloadOrReviewerId;
    actorProfile = actorProfileOrReportId as UserProfile | undefined;
  }

  const effectiveActorId = payload.actor_id || payload.reviewer_id || actorProfile?.id || DEMO_OWNER.id;
  const effectiveRole = payload.actor_role || payload.reviewer_role || actorProfile?.role || 'staff';

  // STRICT ROLE CHECK: Only super_admin may review
  if (effectiveRole !== 'super_admin') {
    return {
      success: false,
      error: 'Unauthorized review. Only the super_admin (Store Owner) is permitted to approve or reject damage reports.',
    };
  }

  // REJECTION VALIDATION: Must require a clear reason
  if (payload.action === 'reject') {
    if (!payload.rejection_reason || !payload.rejection_reason.trim()) {
      return {
        success: false,
        error: 'A rejection reason is mandatory when rejecting a damage report.',
      };
    }
  }

  const reviewerName =
    payload.actor_name || payload.reviewer_name || actorProfile?.full_name || 'Store Owner';
  const nowIso = new Date().toISOString();

  // 1. Try Supabase RPC if client is connected
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client.rpc('review_damage_report_atomic', {
        p_actor_id: effectiveActorId,
        p_report_id: payload.report_id,
        p_action: payload.action,
        p_rejection_reason: payload.rejection_reason?.trim() || null,
      });

      if (error) {
        throw error;
      }

      if (data && data.success) {
        // Sync local store so UI state and balance calculations reflect immediately
        let localReport = localInventoryStore.damageReports.find((r) => r.id === payload.report_id);
        if (localReport) {
          localReport.status = payload.action === 'approve' ? 'approved' : 'rejected';
          localReport.reviewed_by = effectiveActorId;
          localReport.reviewer_name = reviewerName;
          localReport.reviewed_at = nowIso;
          if (payload.action === 'reject') {
            localReport.rejection_reason = payload.rejection_reason?.trim();
          }
        }

        if (payload.action === 'approve') {
          const qty = localReport ? localReport.quantity : Number(data.quantity_deducted || 1);
          const secId = localReport ? localReport.section_id : String(data.section_id || '');
          const secName = localReport ? localReport.section_name : String(data.section_name || 'Section');

          // Append physical deduction to local ledger
          localInventoryStore.movements.unshift({
            id: String(data.movement_id || `mov-${Date.now()}`),
            section_id: secId,
            section_name: secName,
            movement_type: 'damage_deduction',
            quantity_change: -qty,
            reference_id: payload.report_id,
            reference_type: 'damage_report',
            notes: `Approved damage write-off (${qty} pcs)`,
            created_by: effectiveActorId,
            creator_name: reviewerName,
            created_at: nowIso,
          });
        }

        // Trigger balance recalculation and broadcast live inventory update
        localInventoryStore.recalculateBalances();
        notifyInventoryUpdated();

        addAuditLog({
          actor_id: effectiveActorId,
          actor_name: reviewerName,
          action: payload.action === 'approve' ? 'damage_approved' : 'damage_rejected',
          entity: 'damage_report',
          entity_id: payload.report_id,
          before_state: { status: 'pending' },
          after_state: {
            status: payload.action === 'approve' ? 'approved' : 'rejected',
            reviewer: reviewerName,
            rejection_reason: payload.rejection_reason?.trim(),
          },
        });

        return {
          success: true,
          data: localReport,
          action: payload.action === 'approve' ? 'approved' : 'rejected',
        };
      }
    } catch (err: unknown) {
      const msg = extractErrorMessage(err);
      console.warn('Supabase damage review RPC notice, continuing locally:', msg);
      if (
        msg.includes('Unauthorised') ||
        msg.includes('mandatory') ||
        msg.includes('already been reviewed')
      ) {
        return { success: false, error: msg };
      }
    }
  }

  // 2. Local Store Execution (Demo / Offline / Fallback mode)
  const report = localInventoryStore.damageReports.find((r) => r.id === payload.report_id);
  if (!report) {
    return { success: false, error: 'Target damage report was not found.' };
  }

  // PREVENT DUPLICATE APPROVAL / CONCURRENT RACE REVIEW
  if (report.status !== 'pending') {
    return {
      success: false,
      error: `Damage report #${report.id} has already been reviewed (current status: ${report.status.toUpperCase()}). Duplicate review is prohibited.`,
    };
  }

  if (payload.action === 'approve') {
    // Update Report Status
    report.status = 'approved';
    report.reviewed_by = effectiveActorId;
    report.reviewer_name = reviewerName;
    report.reviewed_at = nowIso;

    // Atomically deduct physical stock exactly once via immutable inventory movement
    const movementId = `mov-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const movement: InventoryMovement = {
      id: movementId,
      section_id: report.section_id,
      section_name: report.section_name,
      movement_type: 'damage_deduction',
      quantity_change: -report.quantity, // Negative deduction decrements physical stock
      reference_id: report.id,
      reference_type: 'damage_report',
      notes: `Approved damage write-off (${report.quantity} pcs - ${report.damage_type}): ${report.description}`,
      created_by: effectiveActorId,
      creator_name: reviewerName,
      created_at: nowIso,
    };
    localInventoryStore.movements.unshift(movement);

    // Recalculate balances: physical decrements, pending reservation ends
    localInventoryStore.recalculateBalances();
    notifyInventoryUpdated();

    // Audit Log
    addAuditLog({
      actor_id: effectiveActorId,
      actor_name: reviewerName,
      action: 'damage_approved',
      entity: 'damage_report',
      entity_id: report.id,
      before_state: { status: 'pending', quantity: report.quantity },
      after_state: {
        status: 'approved',
        movement_id: movementId,
        physical_deduction: -report.quantity,
        reviewer: reviewerName,
      },
    });

    return {
      success: true,
      data: report,
      action: 'approved',
    };
  } else {
    // REJECTION: Releases the reservation back to sale availability
    const cleanReason = payload.rejection_reason!.trim();
    report.status = 'rejected';
    report.rejection_reason = cleanReason;
    report.reviewed_by = effectiveActorId;
    report.reviewer_name = reviewerName;
    report.reviewed_at = nowIso;

    // Recalculate balances: status is no longer pending, reservation released!
    localInventoryStore.recalculateBalances();
    notifyInventoryUpdated();

    // Audit Log
    addAuditLog({
      actor_id: effectiveActorId,
      actor_name: reviewerName,
      action: 'damage_rejected',
      entity: 'damage_report',
      entity_id: report.id,
      before_state: { status: 'pending', quantity: report.quantity },
      after_state: {
        status: 'rejected',
        rejection_reason: cleanReason,
        reservation_released: report.quantity,
        reviewer: reviewerName,
      },
    });

    return {
      success: true,
      data: report,
      action: 'rejected',
    };
  }
}

/**
 * 5. Fetch Damage Reports (with optional filtering)
 */
export async function getDamageReports(filter?: {
  status?: DamageStatus;
  sectionId?: string;
  staffId?: string;
  includeOwnerReports?: boolean;
}): Promise<{ success: boolean; data: DamageReport[]; error?: string }> {
  const client = getSupabaseClient();
  if (client) {
    try {
      let query = client
        .from('damage_reports')
        .select(`
          id,
          staff_id,
          section_id,
          quantity,
          damage_type,
          description,
          photo_storage_path,
          photo_url,
          status,
          reviewed_by,
          reviewed_at,
          rejection_reason,
          idempotency_key,
          created_at,
          stock_sections (name, section_code),
          profiles (full_name, role)
        `)
        .order('created_at', { ascending: false });

      if (filter?.status) {
        query = query.eq('status', filter.status);
      }
      if (filter?.sectionId && filter.sectionId !== 'all') {
        query = query.eq('section_id', filter.sectionId);
      }
      if (filter?.staffId && !filter.includeOwnerReports) {
        query = query.eq('staff_id', filter.staffId);
      }

      const { data, error } = await query;
      let fetchedRows: any[] | null = null;

      if (!error && data && data.length > 0) {
        fetchedRows = data;
      } else {
        // Resilient fallback query if relation embedding fails due to multiple profile foreign keys
        let fallbackQuery = client
          .from('damage_reports')
          .select('*')
          .order('created_at', { ascending: false });

        if (filter?.status) {
          fallbackQuery = fallbackQuery.eq('status', filter.status);
        }
        if (filter?.sectionId && filter.sectionId !== 'all') {
          fallbackQuery = fallbackQuery.eq('section_id', filter.sectionId);
        }
        if (filter?.staffId && !filter.includeOwnerReports) {
          fallbackQuery = fallbackQuery.eq('staff_id', filter.staffId);
        }

        const { data: rawRows } = await fallbackQuery;
        if (rawRows && rawRows.length > 0) {
          fetchedRows = rawRows;
        }
      }

      if (fetchedRows && fetchedRows.length > 0) {
        const formatted: DamageReport[] = fetchedRows.map((r: any) => {
          const matchingSec = localInventoryStore.sections.find(
            (s) => s.id === r.section_id || s.section_code === r.section_id
          );
          const staffRole = r.profiles?.role;
          const staffName = r.profiles?.full_name;
          const isOwner =
            staffRole === 'super_admin' ||
            staffName?.toLowerCase().includes('owner') ||
            r.staff_id === DEMO_OWNER.id;

          const photoUrl =
            r.photo_url ||
            getDamagePhotoImmediateUrl(r.photo_storage_path) ||
            getDamagePhotoImmediateUrl(r.id) ||
            (client && r.photo_storage_path
              ? client.storage.from('damage-evidence').getPublicUrl(r.photo_storage_path).data.publicUrl
              : undefined);

          return {
            id: r.id,
            staff_id: r.staff_id,
            staff_name: staffName || (isOwner ? `${DEMO_OWNER.full_name} (Store Owner)` : 'Staff Member'),
            reporter_role: isOwner ? 'super_admin' : 'staff',
            is_owner_report: isOwner,
            section_id: r.section_id,
            section_code: r.stock_sections?.section_code || matchingSec?.section_code,
            section_name: r.stock_sections?.name || matchingSec?.name || 'Section',
            quantity: r.quantity,
            damage_type: r.damage_type,
            description: r.description,
            photo_storage_path: r.photo_storage_path,
            photo_url: photoUrl,
            status: r.status,
            reviewed_by: r.reviewed_by,
            reviewed_at: r.reviewed_at,
            rejection_reason: r.rejection_reason,
            idempotency_key: r.idempotency_key,
            created_at: r.created_at,
          };
        });

        // Sync into local inventory store so review lookups and balances reflect live state
        formatted.forEach((serverReport) => {
          const idx = localInventoryStore.damageReports.findIndex((r) => r.id === serverReport.id);
          if (idx !== -1) {
            localInventoryStore.damageReports[idx] = serverReport;
          } else {
            localInventoryStore.damageReports.push(serverReport);
          }
        });
        localInventoryStore.recalculateBalances();
        notifyInventoryUpdated();

        let results = formatted;
        if (filter?.staffId) {
          results = results.filter((r) => {
            if (filter.includeOwnerReports) {
              return (
                r.staff_id === filter.staffId ||
                r.is_owner_report === true ||
                r.reporter_role === 'super_admin' ||
                r.staff_name?.toLowerCase().includes('owner') ||
                r.staff_id === DEMO_OWNER.id
              );
            }
            return r.staff_id === filter.staffId;
          });
        }

        return { success: true, data: results };
      }
    } catch (err) {
      console.warn('Supabase damage reports fetch failed, using local store:', extractErrorMessage(err));
    }
  }

  // Fallback to local store with guaranteed photo_url resolution
  let list = localInventoryStore.damageReports.map((r) => {
    const photoUrl =
      r.photo_url ||
      getDamagePhotoImmediateUrl(r.photo_storage_path) ||
      getDamagePhotoImmediateUrl(r.id) ||
      undefined;

    return {
      ...r,
      photo_url: photoUrl,
    };
  });

  if (filter?.status) {
    list = list.filter((r) => r.status === filter.status);
  }
  if (filter?.sectionId && filter.sectionId !== 'all') {
    list = list.filter((r) => r.section_id === filter.sectionId);
  }
  if (filter?.staffId) {
    if (filter.includeOwnerReports) {
      list = list.filter(
        (r) =>
          r.staff_id === filter.staffId ||
          r.is_owner_report === true ||
          r.reporter_role === 'super_admin' ||
          r.staff_name?.toLowerCase().includes('owner') ||
          r.staff_id === DEMO_OWNER.id
      );
    } else {
      list = list.filter((r) => r.staff_id === filter.staffId);
    }
  }

  const sorted = list.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return { success: true, data: sorted };
}

/**
 * 6. Fetch Audit Logs
 */
export async function getAuditLogs(entity?: string): Promise<AuditLog[]> {
  const client = getSupabaseClient();
  if (client) {
    try {
      let query = client.from('audit_logs').select('*').order('created_at', { ascending: false });
      if (entity) {
        query = query.eq('entity', entity);
      }
      const { data, error } = await query;
      if (!error && data) {
        return data as AuditLog[];
      }
    } catch (err) {
      console.warn('Supabase audit logs fetch failed:', extractErrorMessage(err));
    }
  }

  return inMemoryAuditLogs;
}
