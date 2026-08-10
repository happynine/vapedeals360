import { getSupabaseClient } from '@/storage/database/supabase-client'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const supabase = getSupabaseClient()
    
    const { data: products, error: fetchError } = await supabase
      .from('products')
      .select('id, image_key, home_image_key')
    
    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }
    
    if (!products || products.length === 0) {
      return NextResponse.json({ message: 'No products found', swapped: 0 })
    }
    
    let swapped = 0
    const errors: string[] = []
    
    for (const product of products) {
      if (product.image_key && product.home_image_key && product.image_key !== product.home_image_key) {
        const { error: updateError } = await supabase
          .from('products')
          .update({
            image_key: product.home_image_key,
            home_image_key: product.image_key
          })
          .eq('id', product.id)
        
        if (updateError) {
          errors.push(`Product ${product.id}: ${updateError.message}`)
        } else {
          swapped++
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      swapped,
      total: products.length,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
