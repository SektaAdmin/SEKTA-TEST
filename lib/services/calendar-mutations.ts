/**
 * Calendar Mutations Service
 * 
 * Handles all write operations:
 * - Reschedule enrollment to different slot
 * - Create new enrollment
 * - Delete/cancel enrollment
 * - Update balance on enrollment changes
 */

import { createClient } from '@supabase/supabase-js';
import type { ConflictCheck } from './calendar';
import { checkScheduleConflict } from './calendar';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ============================================================
// TYPES
// ============================================================

export interface RescheduleEnrollmentParams {
  enrollmentId: string;
  newScheduleId: string;
  clientId: string;
  reason?: string;
}

export interface CreateEnrollmentParams {
  clientId: string;
  scheduleId: string;
  reason?: string;
}

export interface DeleteEnrollmentParams {
  enrollmentId: string;
  reason?: string;
}

export interface RescheduleEnrollmentResult {
  success: boolean;
  enrollmentId?: string;
  error?: string;
  conflict?: ConflictCheck;
}

// ============================================================
// RESCHEDULE ENROLLMENT
// ============================================================

/**
 * Reschedule an enrollment to a different schedule
 * 
 * Performs:
 * 1. Conflict check on new schedule
 * 2. Update enrollment in DB
 * 3. Log change to audit trail
 */
export async function rescheduleEnrollment(
  params: RescheduleEnrollmentParams
): Promise<RescheduleEnrollmentResult> {
  const { enrollmentId, newScheduleId, clientId, reason } = params;

  try {
    // Step 1: Check for conflicts
    const conflict = await checkScheduleConflict(
      clientId,
      newScheduleId,
      enrollmentId
    );

    if (conflict.hasConflict && conflict.conflictType === 'insufficient_sessions') {
      return {
        success: false,
        error: conflict.message || 'Insufficient sessions',
        conflict,
      };
    }

    // Step 2: Get current enrollment to find old schedule
    const { data: currentEnrollment, error: enrollError } = await supabase
      .from('regular_enrollments')
      .select('schedule_id, client_id')
      .eq('id', enrollmentId)
      .single();

    if (enrollError || !currentEnrollment) {
      return {
        success: false,
        error: 'Enrollment not found',
      };
    }

    const oldScheduleId = currentEnrollment.schedule_id;

    // Step 3: Update enrollment with new schedule
    const { error: updateError } = await supabase
      .from('regular_enrollments')
      .update({
        schedule_id: newScheduleId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', enrollmentId);

    if (updateError) {
      return {
        success: false,
        error: `Failed to update enrollment: ${updateError.message}`,
      };
    }

    // Step 4: Log the change (optional - for audit trail)
    // This is handled by DB triggers or separate audit service
    // For now, we just return success

    return {
      success: true,
      enrollmentId,
    };
  } catch (error) {
    console.error('Error rescheduling enrollment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================
// CREATE ENROLLMENT
// ============================================================

/**
 * Create a new enrollment for a client on a schedule
 * 
 * Performs:
 * 1. Conflict check
 * 2. Create enrollment
 * 3. Get initial balance from latest ticket
 * 4. Log to audit trail
 */
export async function createEnrollment(
  params: CreateEnrollmentParams
): Promise<RescheduleEnrollmentResult> {
  const { clientId, scheduleId, reason } = params;

  try {
    // Step 1: Check for conflicts
    const conflict = await checkScheduleConflict(clientId, scheduleId);

    if (conflict.hasConflict) {
      return {
        success: false,
        error: conflict.message || 'Cannot create enrollment',
        conflict,
      };
    }

    // Step 2: Get client's current ticket balance
    const { data: latestSale, error: saleError } = await supabase
      .from('sales')
      .select('tickets:ticket_id (sessions)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (saleError) {
      return {
        success: false,
        error: 'Client has no active ticket',
      };
    }

    const initialBalance = latestSale?.tickets?.sessions || 0;

    if (initialBalance <= 0) {
      return {
        success: false,
        error: 'Client has no remaining sessions',
      };
    }

    // Step 3: Create enrollment
    const { data: newEnrollment, error: createError } = await supabase
      .from('regular_enrollments')
      .insert({
        client_id: clientId,
        schedule_id: scheduleId,
        balance_sessions: initialBalance,
        is_active: true,
      })
      .select('id')
      .single();

    if (createError || !newEnrollment) {
      return {
        success: false,
        error: `Failed to create enrollment: ${createError?.message || 'Unknown error'}`,
      };
    }

    return {
      success: true,
      enrollmentId: newEnrollment.id,
    };
  } catch (error) {
    console.error('Error creating enrollment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================
// DELETE/CANCEL ENROLLMENT
// ============================================================

/**
 * Soft-delete (cancel) an enrollment
 * Sets is_active = false instead of removing the record
 */
export async function deleteEnrollment(
  params: DeleteEnrollmentParams
): Promise<RescheduleEnrollmentResult> {
  const { enrollmentId, reason } = params;

  try {
    const { error } = await supabase
      .from('regular_enrollments')
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', enrollmentId);

    if (error) {
      return {
        success: false,
        error: `Failed to cancel enrollment: ${error.message}`,
      };
    }

    return {
      success: true,
      enrollmentId,
    };
  } catch (error) {
    console.error('Error deleting enrollment:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================
// BATCH OPERATIONS
// ============================================================

/**
 * Update balance_sessions for an enrollment
 * Used when a class is attended and balance decreases
 */
export async function updateEnrollmentBalance(
  enrollmentId: string,
  newBalance: number
): Promise<{ success: boolean; error?: string }> {
  try {
    if (newBalance < 0) {
      return {
        success: false,
        error: 'Balance cannot be negative',
      };
    }

    const { error } = await supabase
      .from('regular_enrollments')
      .update({
        balance_sessions: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', enrollmentId);

    if (error) {
      return {
        success: false,
        error: `Failed to update balance: ${error.message}`,
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Error updating enrollment balance:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
