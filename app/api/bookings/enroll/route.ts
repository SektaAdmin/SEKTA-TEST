import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
 
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
 
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { slot_id, client_id } = body;
    
    console.log('=== BOOKING REQUEST ===');
    console.log('slot_id:', slot_id);
    console.log('client_id:', client_id);
 
    // Валідація
    if (!slot_id || !client_id) {
      return NextResponse.json(
        { error: 'slot_id and client_id required' },
        { status: 400 }
      );
    }
 
    // 1️⃣ Перевір слот вільний
    const { data: slot, error: slotError } = await supabase
      .from('schedule_slots')
      .select('id, status, trainer_id, slot_date, start_time')
      .eq('id', slot_id)
      .single();
 
    if (slotError || !slot) {
      console.log('Slot error:', slotError);
      return NextResponse.json(
        { error: 'Slot not found' },
        { status: 404 }
      );
    }
 
    if (slot.status !== 'free') {
      console.log('Slot status not free:', slot.status);
      return NextResponse.json(
        { error: 'Slot is not available' },
        { status: 409 }
      );
    }
 
    console.log('Slot is free, creating enrollment...');
 
    // 2️⃣ Додай запис в enrollments
    const now = new Date().toISOString();
    const { data: enrollment, error: enrollError } = await supabase
      .from('enrollments')
      .insert([
        {
          slot_id,
          client_id,
          status: 'active',
          is_regular: false,
          sessions_deducted: 1,
          enrolled_at: now,
          updated_at: now,
        },
      ])
      .select();
 
    if (enrollError) {
      console.error('Enrollment error:', enrollError);
      return NextResponse.json(
        { error: enrollError.message || 'Failed to create enrollment' },
        { status: 500 }
      );
    }
 
    console.log('Enrollment created, updating slot...');
 
    // 3️⃣ Оновлюємо статус слота
    const { error: updateError } = await supabase
      .from('schedule_slots')
      .update({ status: 'booked' })
      .eq('id', slot_id);
 
    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json(
        { error: updateError.message || 'Failed to update slot' },
        { status: 500 }
      );
    }
 
    console.log('=== BOOKING SUCCESS ===');
    return NextResponse.json(
      {
        enrollment: enrollment[0],
        message: 'Successfully booked',
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('Error in enroll endpoint:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process booking' },
      { status: 500 }
    );
  }
}