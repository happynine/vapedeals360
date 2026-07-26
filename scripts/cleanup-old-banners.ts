// scripts/cleanup-old-banners.ts
import { list, del } from '@vercel/blob';
import { createClient } from '@supabase/supabase-js';

// 从环境变量读取，不要硬编码
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hmfkepgmnikiaannjnok.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function cleanup() {
  console.log('Starting cleanup...\n');

  // 1. 获取所有正在使用的 banner 图片 key
  const { data: banners } = await supabase.from('banners').select('image_key, mobile_image_key');
  const { data: translations } = await supabase.from('banner_translations').select('image_key');
  
  const activeKeys = new Set([
    ...banners?.map(b => b.image_key).filter(Boolean) || [],
    ...banners?.map(b => b.mobile_image_key).filter(Boolean) || [],
    ...translations?.map(t => t.image_key).filter(Boolean) || [],
  ]);

  console.log(`Found ${activeKeys.size} active banner image keys in database\n`);

  // 2. 列出所有 blob 文件
  const { blobs } = await list();
  const bannerBlobs = blobs.filter(b => b.pathname.startsWith('banners/'));
  
  console.log(`Found ${bannerBlobs.length} files in banners/ folder\n`);

  // 3. 判断哪些需要删除
  const toDelete: typeof blobs = [];
  const toKeep: typeof blobs = [];
  
  for (const blob of bannerBlobs) {
    const isInUse = Array.from(activeKeys).some(key => {
      return blob
