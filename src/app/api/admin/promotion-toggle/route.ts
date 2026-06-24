import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET - 获取促销活动开关状态
export async function GET() {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('site_settings')
    .select('promotions_enabled')
    .limit(1)
    .single();
  
  if (error) {
    // 如果没有记录，创建一条默认记录
    if (error.code === 'PGRST116') {
      const { data: newData, error: insertError } = await supabase
        .from('site_settings')
        .insert({ promotions_enabled: true })
        .select()
        .single();
      
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
      return NextResponse.json({ promotions_enabled: newData.promotions_enabled });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({ promotions_enabled: data?.promotions_enabled ?? true });
}

// PUT - 更新促销活动开关状态
export async function PUT(request: NextRequest) {
  const supabase = getSupabaseClient();
  
  try {
    const body = await request.json();
    const { promotions_enabled } = body as { promotions_enabled: boolean };
    
    if (typeof promotions_enabled !== 'boolean') {
      return NextResponse.json({ error: 'promotions_enabled must be a boolean' }, { status: 400 });
    }
    
    // 先检查是否存在记录
    const { data: existing, error: checkError } = await supabase
      .from('site_settings')
      .select('id')
      .limit(1)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') {
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }
    
    if (existing) {
      // 更新现有记录
      const { error: updateError } = await supabase
        .from('site_settings')
        .update({ 
          promotions_enabled,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);
      
      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
    } else {
      // 创建新记录
      const { error: insertError } = await supabase
        .from('site_settings')
        .insert({ 
          promotions_enabled,
          updated_at: new Date().toISOString()
        });
      
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }
    
    return NextResponse.json({ success: true, promotions_enabled });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}