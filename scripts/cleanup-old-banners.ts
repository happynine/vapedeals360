// scripts/cleanup-old-banners.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://hmfkepgmnikiaannjnok.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function cleanup() {
  console.log('Starting cleanup...\n');

  // 1. 获取所有正在使用的 banner 图片 URL
  const { data: banners } = await supabase.from('banners').select('image_key, mobile_image_key');
  const { data: translations } = await supabase.from('banner_translations').select('image_key');
  
  const activeUrls = new Set([
    ...banners?.map(b => b.image_key).filter(Boolean) || [],
    ...banners?.map(b => b.mobile_image_key).filter(Boolean) || [],
    ...translations?.map(t => t.image_key).filter(Boolean) || [],
  ]);

  console.log(`Found ${activeUrls.size} active banner images in database\n`);

  // 2. 列出 Supabase Storage 中所有文件
  const { data: files, error } = await supabase.storage.from('banners').list();
  
  if (error) {
    console.error('Failed to list storage files:', error.message);
    process.exit(1);
  }

  console.log(`Found ${files?.length || 0} files in banners storage\n`);

  // 3. 判断哪些需要删除
  const toDelete: string[] = [];
  const toKeep: string[] = [];
  
  for (const file of files || []) {
    // 构造完整的 URL
    const fileUrl = `${SUPABASE_URL}/storage/v1/object/public/banners/${file.name}`;
    
    if (activeUrls.has(fileUrl)) {
      toKeep.push(file.name);
    } else {
      toDelete.push(file.name);
    }
  }

  console.log(`Files to keep: ${toKeep.length}`);
  console.log(`Files to delete: ${toDelete.length}\n`);

  if (toKeep.length > 0) {
    console.log('Keeping:');
    toKeep.forEach(f => console.log('  ✓', f));
    console.log('');
  }

  if (toDelete.length > 0) {
    console.log('Deleting:');
    toDelete.forEach(f => console.log('  ✗', f));
    console.log('');
    
    // 执行删除
    const { error: deleteError } = await supabase.storage.from('banners').remove(toDelete);
    
    if (deleteError) {
      console.error('Delete failed:', deleteError.message);
    } else {
      console.log(`Done! Successfully deleted ${toDelete.length} files.`);
    }
  } else {
    console.log('No files to delete.');
  }
}

cleanup().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
