/**
 * useCalendarData Hook
 * 
 * Handles calendar data fetching with:
 * - SWR for client-side caching and revalidation
 * - Automatic error handling and retry
 * - Loading states for UI
 * - Week navigation
 */

'use client';

import useSWR from 'swr';
import { useState, useCallback } from 'react';
import type { WeekCalendarData, CalendarEvent } from '@/lib/services/calendar';
import { getWeekCalendarData } from '@/lib/services/calendar';

export interface UseCalendarDataOptions {
  /** Initial week date (defaults to current week) */
  initialDate?: Date;
  /** Revalidate interval in ms (default: 5 minutes) */
  revalidateInterval?: number;
  /** Enable automatic revalidation (default: true) */
  revalidateOnFocus?: boolean;
}

export interface UseCalendarDataReturn {
  // Data
  calendarData: WeekCalendarData | undefined;
  events: CalendarEvent[];
  isLoading: boolean;
  error: Error | undefined;

  // Week navigation
  currentWeekStart: Date;
  nextWeek: () => void;
  previousWeek: () => void;
  goToWeek: (date: Date) => void;
  goToToday: () => void;

  // Utilities
  getEventsForDate: (date: Date) => CalendarEvent[];
  getEventsBySchedule: (scheduleId: string) => CalendarEvent[];
  getEventsByEnrollmentType: (type: 'one-time' | 'regular') => CalendarEvent[];
  revalidate: () => Promise<any>;
}

export function useCalendarData(
  options: UseCalendarDataOptions = {}
): UseCalendarDataReturn {
  const {
    initialDate = new Date(),
    revalidateInterval = 5 * 60 * 1000,
    revalidateOnFocus = true,
  } = options;

  // State management
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const d = new Date(initialDate);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  });

  const cacheKey = `calendar-week-${currentWeekStart.toISOString().split('T')[0]}`;

  const { data: calendarData, error, isLoading, mutate } = useSWR<WeekCalendarData, Error>(
    cacheKey,
    () => getWeekCalendarData(currentWeekStart),
    {
      revalidateInterval,
      revalidateOnFocus,
      dedupingInterval: 2000,
      focusThrottleInterval: 10000,
      shouldRetryOnError: true,
      errorRetryCount: 3,
      errorRetryInterval: 1000,
    }
  );

  // Week navigation
  const nextWeek = useCallback(() => {
    setCurrentWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 7);
      return next;
    });
  }, []);

  const previousWeek = useCallback(() => {
    setCurrentWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 7);
      return next;
    });
  }, []);

  const goToWeek = useCallback((date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    setCurrentWeekStart(new Date(d.setDate(diff)));
  }, []);

  const goToToday = useCallback(() => {
    goToWeek(new Date());
  }, [goToWeek]);

  // Data utilities
  const getEventsForDate = useCallback(
    (date: Date): CalendarEvent[] => {
      if (!calendarData) return [];
      const dateStr = date.toISOString().split('T')[0];
      return calendarData.events.filter((event) => event.slotDate === dateStr);
    },
    [calendarData]
  );

  const getEventsBySchedule = useCallback(
    (scheduleId: string): CalendarEvent[] => {
      if (!calendarData) return [];
      return calendarData.events.filter((event) => event.scheduleId === scheduleId);
    },
    [calendarData]
  );

  const getEventsByEnrollmentType = useCallback(
    (type: 'one-time' | 'regular'): CalendarEvent[] => {
      if (!calendarData) return [];
      return calendarData.events.filter((event) => event.enrollmentType === type);
    },
    [calendarData]
  );

  return {
    calendarData,
    events: calendarData?.events || [],
    isLoading,
    error,
    currentWeekStart,
    nextWeek,
    previousWeek,
    goToWeek,
    goToToday,
    getEventsForDate,
    getEventsBySchedule,
    getEventsByEnrollmentType,
    revalidate: mutate,
  };
}

// Helper hooks
export function useCalendarEventsByTime(events: CalendarEvent[]) {
  const eventsByTime = new Map<string, CalendarEvent[]>();
  events.forEach((event) => {
    const timeKey = `${event.startTime.hour}:${event.startTime.minute
      .toString()
      .padStart(2, '0')}`;
    if (!eventsByTime.has(timeKey)) {
      eventsByTime.set(timeKey, []);
    }
    eventsByTime.get(timeKey)!.push(event);
  });
  return eventsByTime;
}

export function useCalendarEventsByHall(events: CalendarEvent[]) {
  const eventsByHall = new Map<string, CalendarEvent[]>();
  events.forEach((event) => {
    if (!eventsByHall.has(event.hallId)) {
      eventsByHall.set(event.hallId, []);
    }
    eventsByHall.get(event.hallId)!.push(event);
  });
  return eventsByHall;
}

export function useCalendarEventsByTrainer(events: CalendarEvent[]) {
  const eventsByTrainer = new Map<string, CalendarEvent[]>();
  events.forEach((event) => {
    if (!eventsByTrainer.has(event.trainerId)) {
      eventsByTrainer.set(event.trainerId, []);
    }
    eventsByTrainer.get(event.trainerId)!.push(event);
  });
  return eventsByTrainer;
}
