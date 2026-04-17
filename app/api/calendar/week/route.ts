/**
 * API Route: GET /api/calendar/week
 * 
 * Fetches calendar data for a given week
 * Returns all enrollments (one-time + regular) with client sessions
 * 
 * Query params:
 * - date: ISO date string for any day in the target week
 */

import { getWeekCalendarData } from '@/lib/services/calendar';
import { NextRequest, NextResponse } from 'next/server';

export const revalidate = 300; // Cache for 5 minutes

export async function GET(request: NextRequest) {
  try {
    const dateParam = request.nextUrl.searchParams.get('date');
    const weekStart = dateParam ? new Date(dateParam) : new Date();

    if (isNaN(weekStart.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DD)' },
        { status: 400 }
      );
    }

    const calendarData = await getWeekCalendarData(weekStart);

    return NextResponse.json(calendarData, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Error in /api/calendar/week:', error);

    const message = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      { error: 'Failed to fetch calendar data', details: message },
      { status: 500 }
    );
  }
}
