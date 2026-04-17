/**
 * Calendar Service Layer
 * 
 * Handles calendar data operations for GYM CRM:
 * - Fetches schedule_slots (actual date/time instances)
 * - Gets enrollments (one-time bookings) + regular_enrollments (recurring)
 * - Retrieves client session balance from view
 * - Combines data for calendar display
 */

import { createClient } from '@supabase/supabase-js';

// Types
export interface TimeSlot {
  hour: number;
  minute: number;
}

export interface CalendarEvent {
  id: string; // enrollment id or regular_enrollment id
  clientId: string;
  clientName: string;
  clientPhone?: string;
  scheduleId: string;
  slotId: string;
  slotDate: string; // YYYY-MM-DD
  startTime: TimeSlot;
  endTime: TimeSlot;
  hallId: string;
  hallName: string;
  trainerId: string;
  trainerName: string;
  ticketType?: string;
  sessionsRemaining: number;
  enrollmentType: 'one-time' | 'regular'; // enrollment vs regular_enrollments
  status?: string; // for one-time enrollments
  durationMinutes: number;
}

export interface WeekCalendarData {
  events: CalendarEvent[];
  weekStart: Date;
  weekEnd: Date;
}

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Parse time string "HH:MM" to TimeSlot object
 */
function parseTimeSlot(timeStr: string): TimeSlot {
  if (!timeStr) return { hour: 0, minute: 0 };
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hour: hours || 0, minute: minutes || 0 };
}

/**
 * Add minutes to a TimeSlot
 */
function addMinutesToTimeSlot(timeSlot: TimeSlot, minutes: number): TimeSlot {
  const totalMinutes = timeSlot.hour * 60 + timeSlot.minute + minutes;
  return {
    hour: Math.floor(totalMinutes / 60) % 24,
    minute: totalMinutes % 60,
  };
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get Monday of given week
 */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// ============================================================
// QUERY LAYER
// ============================================================

/**
 * Fetch schedule_slots for a date range (week)
 */
async function getScheduleSlotsForWeek(weekStart: Date, weekEnd: Date) {
  const { data, error } = await supabase
    .from('schedule_slots')
    .select(`
      id,
      schedule_id,
      slot_date,
      start_time,
      capacity_override,
      is_cancelled,
      hall_id,
      trainer_id,
      course_name,
      course_type,
      created_at
    `)
    .gte('slot_date', formatDate(weekStart))
    .lt('slot_date', formatDate(weekEnd))
    .eq('is_cancelled', false)
    .order('slot_date', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw new Error(`Failed to fetch schedule_slots: ${error.message}`);
  return data || [];
}

/**
 * Fetch schedules (for duration_minutes calculation)
 */
async function getSchedulesByIds(scheduleIds: string[]) {
  if (scheduleIds.length === 0) return [];

  const { data, error } = await supabase
    .from('schedules')
    .select('id, duration_minutes, title, schedule_type')
    .in('id', scheduleIds);

  if (error) throw new Error(`Failed to fetch schedules: ${error.message}`);
  return data || [];
}

/**
 * Fetch one-time enrollments for slots
 */
async function getEnrollmentsForSlots(slotIds: string[]) {
  if (slotIds.length === 0) return [];

  const { data, error } = await supabase
    .from('enrollments')
    .select(`
      id,
      slot_id,
      client_id,
      status,
      enrolled_at,
      sessions_deducted
    `)
    .in('slot_id', slotIds)
    .eq('status', 'active'); // Only active enrollments

  if (error) throw new Error(`Failed to fetch enrollments: ${error.message}`);
  return data || [];
}

/**
 * Fetch regular enrollments for schedules
 */
async function getRegularEnrollmentsForSchedules(scheduleIds: string[]) {
  if (scheduleIds.length === 0) return [];

  const { data, error } = await supabase
    .from('regular_enrollments')
    .select(`
      id,
      client_id,
      schedule_id,
      created_at,
      valid_until
    `)
    .in('schedule_id', scheduleIds)
    // Only valid enrollments
    .gte('valid_until', formatDate(new Date()));

  if (error) {
    throw new Error(`Failed to fetch regular_enrollments: ${error.message}`);
  }
  return data || [];
}

/**
 * Fetch clients by IDs
 */
async function getClientsByIds(clientIds: string[]) {
  if (clientIds.length === 0) return [];

  const { data, error } = await supabase
    .from('clients')
    .select('id, first_name, last_name, phone')
    .in('id', clientIds);

  if (error) throw new Error(`Failed to fetch clients: ${error.message}`);
  return data || [];
}

/**
 * Fetch trainers by IDs
 */
async function getTrainersByIds(trainerIds: string[]) {
  if (trainerIds.length === 0) return [];

  const { data, error } = await supabase
    .from('trainers')
    .select('id, name, is_active')
    .in('id', trainerIds);

  if (error) throw new Error(`Failed to fetch trainers: ${error.message}`);
  return data || [];
}

/**
 * Fetch halls by IDs
 */
async function getHallsByIds(hallIds: string[]) {
  if (hallIds.length === 0) return [];

  const { data, error } = await supabase
    .from('halls')
    .select('id, name, capacity')
    .in('id', hallIds);

  if (error) throw new Error(`Failed to fetch halls: ${error.message}`);
  return data || [];
}

/**
 * Fetch session balance from view
 */
async function getSessionBalance(clientIds: string[]) {
  if (clientIds.length === 0) return [];

  const { data, error } = await supabase
    .from('client_session_balance')
    .select(`
      client_id,
      ticket_type,
      sessions_remaining,
      total_purchased,
      total_used
    `)
    .in('client_id', clientIds);

  if (error) {
    throw new Error(`Failed to fetch session balance: ${error.message}`);
  }
  return data || [];
}

// ============================================================
// TRANSFORMATION LAYER
// ============================================================

/**
 * Transform slot + enrollment data into CalendarEvent
 */
function createCalendarEvent(
  slot: any,
  enrollment: any,
  schedule: any,
  client: any,
  trainer: any,
  hall: any,
  sessionBalance: any
): CalendarEvent {
  const startTime = parseTimeSlot(slot.start_time);
  const durationMinutes = schedule?.duration_minutes || 60;
  const endTime = addMinutesToTimeSlot(startTime, durationMinutes);

  return {
    id: enrollment.id,
    clientId: enrollment.client_id,
    clientName: `${client?.first_name || 'Unknown'} ${client?.last_name || ''}`.trim(),
    clientPhone: client?.phone,
    scheduleId: slot.schedule_id,
    slotId: slot.id,
    slotDate: slot.slot_date,
    startTime,
    endTime,
    hallId: slot.hall_id,
    hallName: hall?.name || 'Unknown Hall',
    trainerId: slot.trainer_id,
    trainerName: trainer?.name || 'Unknown Trainer',
    ticketType: sessionBalance?.ticket_type,
    sessionsRemaining: sessionBalance?.sessions_remaining || 0,
    enrollmentType: 'one-time',
    status: enrollment.status,
    durationMinutes,
  };
}

/**
 * Transform regular enrollment + schedule data
 */
function createRegularCalendarEvent(
  regularEnrollment: any,
  scheduleSlot: any,
  schedule: any,
  client: any,
  trainer: any,
  hall: any,
  sessionBalance: any
): CalendarEvent {
  const startTime = parseTimeSlot(scheduleSlot.start_time);
  const durationMinutes = schedule?.duration_minutes || 60;
  const endTime = addMinutesToTimeSlot(startTime, durationMinutes);

  return {
    id: regularEnrollment.id,
    clientId: regularEnrollment.client_id,
    clientName: `${client?.first_name || 'Unknown'} ${client?.last_name || ''}`.trim(),
    clientPhone: client?.phone,
    scheduleId: regularEnrollment.schedule_id,
    slotId: scheduleSlot.id,
    slotDate: scheduleSlot.slot_date,
    startTime,
    endTime,
    hallId: scheduleSlot.hall_id,
    hallName: hall?.name || 'Unknown Hall',
    trainerId: scheduleSlot.trainer_id,
    trainerName: trainer?.name || 'Unknown Trainer',
    ticketType: sessionBalance?.ticket_type,
    sessionsRemaining: sessionBalance?.sessions_remaining || 0,
    enrollmentType: 'regular',
    durationMinutes,
  };
}

// ============================================================
// MAIN PUBLIC API
// ============================================================

/**
 * Get complete week calendar data
 * Returns events for all enrollments (one-time + regular)
 */
export async function getWeekCalendarData(
  weekStart: Date
): Promise<WeekCalendarData> {
  try {
    // Normalize to Monday
    const monday = getMonday(weekStart);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 7);

    // Step 1: Fetch schedule_slots for the week
    const slots = await getScheduleSlotsForWeek(monday, sunday);

    if (slots.length === 0) {
      return {
        events: [],
        weekStart: monday,
        weekEnd: sunday,
      };
    }

    // Step 2: Fetch related data
    const slotIds = slots.map((s: any) => s.id);
    const scheduleIds = [...new Set(slots.map((s: any) => s.schedule_id))];
    const hallIds = [...new Set(slots.map((s: any) => s.hall_id))];
    const trainerIds = [...new Set(slots.map((s: any) => s.trainer_id))];

    const [
      enrollments,
      regularEnrollments,
      schedules,
      halls,
      trainers,
    ] = await Promise.all([
      getEnrollmentsForSlots(slotIds),
      getRegularEnrollmentsForSchedules(scheduleIds),
      getSchedulesByIds(Array.from(scheduleIds)),
      getHallsByIds(Array.from(hallIds)),
      getTrainersByIds(Array.from(trainerIds)),
    ]);

    // Step 3: Get all client IDs and fetch clients + session balance
    const clientIds = [
      ...new Set([
        ...enrollments.map((e: any) => e.client_id),
        ...regularEnrollments.map((r: any) => r.client_id),
      ]),
    ];

    const [clients, sessionBalances] = await Promise.all([
      getClientsByIds(clientIds),
      getSessionBalance(clientIds),
    ]);

    // Step 4: Create lookup maps
    const scheduleMap = new Map(schedules.map((s: any) => [s.id, s]));
    const clientMap = new Map(clients.map((c: any) => [c.id, c]));
    const trainerMap = new Map(trainers.map((t: any) => [t.id, t]));
    const hallMap = new Map(halls.map((h: any) => [h.id, h]));
    const sessionBalanceMap = new Map(
      sessionBalances.map((sb: any) => [
        `${sb.client_id}:${sb.ticket_type}`,
        sb,
      ])
    );

    // Step 5: Build calendar events

    const events: CalendarEvent[] = [];

    // One-time enrollments
    for (const enrollment of enrollments) {
      const slot = slots.find((s: any) => s.id === enrollment.slot_id);
      if (!slot) continue;

      const schedule = scheduleMap.get(slot.schedule_id);
      const client = clientMap.get(enrollment.client_id);
      const trainer = trainerMap.get(slot.trainer_id);
      const hall = hallMap.get(slot.hall_id);

      // Find best matching session balance
      let sessionBalance = sessionBalanceMap.get(
        `${enrollment.client_id}:${slot.course_type}`
      );
      if (!sessionBalance) {
        // Fallback: get any session balance for this client
        sessionBalance = Array.from(sessionBalanceMap.values()).find(
          (sb: any) => sb.client_id === enrollment.client_id
        );
      }

      if (client && trainer && hall) {
        events.push(
          createCalendarEvent(
            slot,
            enrollment,
            schedule,
            client,
            trainer,
            hall,
            sessionBalance
          )
        );
      }
    }

    // Regular enrollments
    for (const regularEnrollment of regularEnrollments) {
      // Find slots matching this schedule
      const scheduleSlots = slots.filter(
        (s: any) => s.schedule_id === regularEnrollment.schedule_id
      );

      for (const slot of scheduleSlots) {
        const schedule = scheduleMap.get(regularEnrollment.schedule_id);
        const client = clientMap.get(regularEnrollment.client_id);
        const trainer = trainerMap.get(slot.trainer_id);
        const hall = hallMap.get(slot.hall_id);

        // Find best matching session balance
        let sessionBalance = sessionBalanceMap.get(
          `${regularEnrollment.client_id}:${slot.course_type}`
        );
        if (!sessionBalance) {
          // Fallback: get any session balance
          sessionBalance = Array.from(sessionBalanceMap.values()).find(
            (sb: any) => sb.client_id === regularEnrollment.client_id
          );
        }

        if (client && trainer && hall) {
          events.push(
            createRegularCalendarEvent(
              regularEnrollment,
              slot,
              schedule,
              client,
              trainer,
              hall,
              sessionBalance
            )
          );
        }
      }
    }

    return {
      events,
      weekStart: monday,
      weekEnd: sunday,
    };
  } catch (error) {
    console.error('Error fetching week calendar data:', error);
    throw error;
  }
}

