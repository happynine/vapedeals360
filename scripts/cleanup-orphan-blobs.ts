/**
 * 清理 Blob 存储中的孤儿文件
 * 
 * 使用方法：
 * 1. 确保 .env.local 中有 BLOB_READ_WRITE_TOKEN
 * 2. 运行：npx tsx scripts/cleanup-orphan-blobs.ts (预览模式)
 * 3. 运行：npx tsx scripts/cleanup-orphan-blobs.ts --confirm (实际删除)
 * 
 * 功能：
 * 1. 获取 products 文件夹中的所有 Blob 文件
 * 2. 获取数据库中所有产品的图片引用
 * 3. 对比找出孤儿文件
 * 4. 删除孤儿文件
 */

import { list, del } from '@vercel/blob';
import { getSupabaseClient } from '../src/storage/database/supabase-client';

async function getDatabaseImageKeys(): Promise<Set<string>> {
  const client = getSupabaseClient();
  const imageKeys = new Set<string>();

  // 获取 products 表中的所有图片相关字段
  const { data: products, error } = await client
    .from('products')
    .select('image_url, image_url_small, home_image_key, images');

  if (error) {
    console.error('Failed to fetch products:', error);
    process.exit(1);
  }

  for (const product of products || []) {
    // image_url (可能是 JSON 字符串包含 large 和 small)
    if (product.image_url) {
      try {
        const urls = JSON.parse(product.image_url);
        if (urls.large) imageKeys.add(urls.large);
        if (urls.small) imageKeys.add(urls.small);
      } catch {
        imageKeys.add(product.image_url);
      }
    }
    // image_url_small
    if (product.image_url_small) {
      imageKeys.add(product.image_url_small);
    }
    // home_image_key
    if (product.home_image_key) {
      imageKeys.add(product.home_image_key);
    }
    // images (JSON 数组)
    if (product.images) {
      try {
        const imagesArr = JSON.parse(product.images);
        if (Array.isArray(imagesArr)) {
          for (const img of imagesArr) {
            if (typeof img === 'string') imageKeys.add(img);
            else if (img?.url) imageKeys.add(img.url);
          }
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  // 获取 promotion_products 表中的图片
  const { data: promoProducts, error: promoError } = await client
    .from('promotion_products')
    .select('image_key, home_image_key, image_url');

  if (promoError) {
    console.error('Failed to fetch promotion_products:', promoError);
  } else {
    for (const pp of promoProducts || []) {
      if (pp.image_key) imageKeys.add(pp.image_key);
      if (pp.home_image_key) imageKeys.add(pp.home_image_key);
      if (pp.image_url) imageKeys.add(pp.image_url);
    }
  }

  // 获取 banners 表中的图片
  const { data: banners, error: bannerError } = await client
    .from('banners')
    .select('image_key, mobile_image_key');

  if (bannerError) {
    console.error('Failed to fetch banners:', bannerError);
  } else {
    for (const banner of banners || []) {
      if (banner.image_key) imageKeys.add(banner.image_key);
      if (banner.mobile_image_key) imageKeys.add(banner.mobile_image_key);
    }
  }

  // 获取 stores 表中的 logo
  const { data: stores, error: storeError } = await client
    .from('stores')
    .select('logo_url');

  if (storeError) {
    console.error('Failed to fetch stores:', storeError);
  } else {
    for (const store of stores || []) {
      if (store.logo_url) imageKeys.add(store.logo_url);
    }
  }

  return imageKeys;
}

async function getBlobFilesInProductsFolder(): Promise<Array<{ url: string; pathname: string }>> {
  const files: Array<{ url: string; pathname: string }> = [];
  let cursor: string | undefined;

  do {
    const result = await list({
      prefix: 'products/',
      cursor,
      limit: 1000,
    });

    for (const blob of result.blobs) {
      files.push({ url: blob.url, pathname: blob.pathname });
    }

    cursor = result.cursor;
  } while (cursor);

  return files;
}

function extractKeyFromUrl(url: string): string {
  // URL 格式：https://xxx.public.blob.vercel-storage.com/products/xxx.jpg
  // 提取 products/xxx.jpg 部分
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.slice(1); // 去掉开头的 /
  } catch {
    return url;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const confirmDelete = args.includes('--confirm');

  // 检查环境变量
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('❌ 错误：未设置 BLOB_READ_WRITE_TOKEN 环境变量');
    console.error('');
    console.error('请在 .env.local 文件中添加：');
    console.error('BLOB_READ_WRITE_TOKEN=your_token_here');
    console.error('');
    console.error('获取方式：');
    console.error('1. 打开 Vercel Dashboard');
    console.error('2. 进入 vapedeals360 项目');
    console.error('3. Settings → Environment Variables');
    console.error('4. 复制 BLOB_READ_WRITE_TOKEN 的值');
    console.error('');
    console.error('或者直接在命令行中设置：');
    console.error('export BLOB_READ_WRITE_TOKEN=your_token_here');
    console.error('npx tsx scripts/cleanup-orphan-blobs.ts');
    process.exit(1);
  }

  console.log('=== Blob 孤儿文件清理工具 ===\n');

  if (!confirmDelete) {
    console.log('⚠️  当前为 DRY-RUN 模式（不会实际删除文件）');
    console.log('   要实际删除，请运行：npx tsx scripts/cleanup-orphan-blobs.ts --confirm\n');
  }

  // 1. 获取数据库中的所有图片引用
  console.log('1. 获取数据库中的图片引用...');
  const dbImageKeys = await getDatabaseImageKeys();
  console.log(`   找到 ${dbImageKeys.size} 个图片引用\n`);

  // 2. 获取 Blob 存储中的文件
  console.log('2. 获取 Blob 存储 products/ 文件夹中的文件...');
  const blobFiles = await getBlobFilesInProductsFolder();
  console.log(`   找到 ${blobFiles.length} 个文件\n`);

  // 3. 找出孤儿文件
  const orphanFiles: Array<{ url: string; pathname: string }> = [];
  const usedFiles: Array<{ url: string; pathname: string }> = [];

  for (const file of blobFiles) {
    const key = extractKeyFromUrl(file.url);
    if (dbImageKeys.has(file.url) || dbImageKeys.has(key)) {
      usedFiles.push(file);
    } else {
      orphanFiles.push(file);
    }
  }

  console.log(`3. 分析结果：`);
  console.log(`   - 正在使用的文件：${usedFiles.length} 个`);
  console.log(`   - 孤儿文件：${orphanFiles.length} 个\n`);

  if (orphanFiles.length === 0) {
    console.log('✅ 没有发现孤儿文件！');
    return;
  }

  // 4. 显示孤儿文件列表
  console.log('4. 孤儿文件列表：');
  let totalSize = 0;
  for (const file of orphanFiles) {
    console.log(`   - ${file.pathname}`);
  }
  console.log(`\n   总计：${orphanFiles.length} 个文件\n`);

  // 5. 删除孤儿文件
  if (confirmDelete) {
    console.log('5. 开始删除孤儿文件...');
    let deletedCount = 0;
    let failedCount = 0;

    for (const file of orphanFiles) {
      try {
        await del(file.url);
        deletedCount++;
        console.log(`   ✅ 已删除：${file.pathname}`);
      } catch (error) {
        failedCount++;
        console.error(`   ❌ 删除失败：${file.pathname}`, error);
      }
    }

    console.log(`\n=== 清理完成 ===`);
    console.log(`   成功删除：${deletedCount} 个文件`);
    console.log(`   删除失败：${failedCount} 个文件`);
  } else {
    console.log('5. 跳过删除（DRY-RUN 模式）');
    console.log('\n要实际删除这些文件，请运行：');
    console.log('   npx tsx scripts/cleanup-orphan-blobs.ts --confirm');
  }
}

main().catch((error) => {
  console.error('脚本执行失败:', error);
  process.exit(1);
});
