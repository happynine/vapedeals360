/**
 * 将 News 文件夹中属于 Best Vapes 内容的图片迁移到 bestvapes 文件夹
 * 
 * 使用方法：
 * 1. 确保 .env.local 中有 BLOB_READ_WRITE_TOKEN 和 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY
 * 2. 运行：npx tsx scripts/migrate-bestvapes-images.ts (预览模式)
 * 3. 运行：npx tsx scripts/migrate-bestvapes-images.ts --confirm (实际迁移)
 * 
 * 功能：
 * 1. 查询所有 type='best-vapes' 的内容页面
 * 2. 从 content 字段中提取图片 URL
 * 3. 筛选出在 news/ 文件夹中的图片
 * 4. 将这些图片复制到 bestvapes/ 文件夹
 * 5. 更新数据库中的图片 URL
 * 6. 删除 news/ 中的原文件
 */

import { list, put, del, head } from '@vercel/blob';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客户端
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// 从 HTML 内容中提取图片 URL
function extractImageUrls(html: string): string[] {
  const imgRegex = /src="([^"]+)"/g;
  const urls: string[] = [];
  let match;
  
  while ((match = imgRegex.exec(html)) !== null) {
    const url = match[1];
    // 只处理 blob 存储的图片
    if (url.includes('public.blob.vercel-storage.com')) {
      urls.push(url);
    }
  }
  
  return urls;
}

// 从 URL 中提取文件名
function getFilenameFromUrl(url: string): string {
  const urlObj = new URL(url);
  return urlObj.pathname.split('/').pop() || '';
}

// 从 URL 中提取文件夹路径
function getFolderFromUrl(url: string): string {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/').filter(p => p);
  // 返回文件夹路径，如 "news/" 或 "bestvapes/"
  return pathParts.length > 1 ? pathParts[0] + '/' : '';
}

async function main() {
  const args = process.argv.slice(2);
  const confirmMigrate = args.includes('--confirm');

  // 检查环境变量
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('❌ 错误：未设置 BLOB_READ_WRITE_TOKEN 环境变量');
    console.error('');
    console.error('请在 .env.local 文件中添加：');
    console.error('BLOB_READ_WRITE_TOKEN=your_token_here');
    console.error('SUPABASE_URL=your_supabase_url');
    console.error('SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
    process.exit(1);
  }

  console.log('=== Best Vapes 图片迁移工具 ===\n');

  // 1. 查询所有 best-vapes 类型的内容页面
  console.log('1. 查询 Best Vapes 内容页面...');
  const { data: pages, error: pagesError } = await supabase
    .from('content_pages')
    .select(`
      id,
      type,
      slug,
      cover_image,
      content_page_translations (
        content
      )
    `)
    .eq('type', 'best-vapes');

  if (pagesError) {
    console.error('❌ 查询内容页面失败:', pagesError.message);
    process.exit(1);
  }

  console.log(`   找到 ${pages?.length || 0} 个 Best Vapes 页面\n`);

  // 2. 提取所有图片 URL
  console.log('2. 提取图片 URL...');
  const allImageUrls = new Set<string>();
  const coverImages = new Set<string>();

  for (const page of pages || []) {
    // 收集封面图
    if (page.cover_image) {
      coverImages.add(page.cover_image);
    }

    // 收集内容中的图片
    const translations = page.content_page_translations as Array<{ content: string }>;
    if (translations) {
      for (const translation of translations) {
        if (translation.content) {
          const urls = extractImageUrls(translation.content);
          urls.forEach(url => allImageUrls.add(url));
        }
      }
    }
  }

  console.log(`   封面图：${coverImages.size} 个`);
  console.log(`   内容图片：${allImageUrls.size} 个`);
  console.log(`   总计：${coverImages.size + allImageUrls.size} 个图片\n`);

  // 3. 筛选出在 news/ 文件夹中的图片
  console.log('3. 筛选 News 文件夹中的图片...');
  const newsImages: Array<{ url: string; filename: string; isCover: boolean }> = [];

  for (const url of [...allImageUrls, ...coverImages]) {
    const folder = getFolderFromUrl(url);
    if (folder === 'news/') {
      newsImages.push({
        url,
        filename: getFilenameFromUrl(url),
        isCover: coverImages.has(url)
      });
    }
  }

  console.log(`   需要迁移的图片：${newsImages.length} 个\n`);

  if (newsImages.length === 0) {
    console.log('✅ 没有需要迁移的图片');
    process.exit(0);
  }

  // 4. 显示迁移列表
  console.log('4. 迁移列表：');
  for (const img of newsImages) {
    const type = img.isCover ? '[封面]' : '[内容]';
    console.log(`   ${type} ${img.filename}`);
  }
  console.log('');

  if (!confirmMigrate) {
    console.log('⚠️  这是预览模式，不会实际迁移');
    console.log('   添加 --confirm 参数执行实际迁移：');
    console.log('   npx tsx scripts/migrate-bestvapes-images.ts --confirm');
    process.exit(0);
  }

  // 5. 执行迁移
  console.log('5. 开始迁移...\n');
  let successCount = 0;
  let errorCount = 0;

  for (const img of newsImages) {
    try {
      console.log(`   处理：${img.filename}`);

      // 读取原文件
      const response = await fetch(img.url);
      if (!response.ok) {
        throw new Error(`下载失败：${response.status}`);
      }

      const blob = await response.blob();
      const buffer = Buffer.from(await blob.arrayBuffer());

      // 上传到 bestvapes 文件夹
      const newUrl = await put(`bestvapes/${img.filename}`, buffer, {
        access: 'public',
        addRandomSuffix: false,
      });

      console.log(`   ✓ 已上传：${newUrl.url}`);

      // 更新数据库中的 URL
      if (img.isCover) {
        // 更新封面图
        const { error: updateError } = await supabase
          .from('content_pages')
          .update({ cover_image: newUrl.url })
          .eq('cover_image', img.url);

        if (updateError) {
          console.error(`   ✗ 更新封面图失败：${updateError.message}`);
          errorCount++;
        } else {
          console.log(`   ✓ 已更新封面图引用`);
        }
      } else {
        // 更新内容中的图片 URL
        for (const page of pages || []) {
          const translations = page.content_page_translations as Array<{ content: string; id?: number }>;
          if (translations) {
            for (const translation of translations) {
              if (translation.content && translation.content.includes(img.url)) {
                const updatedContent = translation.content.replace(
                  new RegExp(img.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
                  newUrl.url
                );

                const { error: updateError } = await supabase
                  .from('content_page_translations')
                  .update({ content: updatedContent })
                  .eq('id', translation.id);

                if (updateError) {
                  console.error(`   ✗ 更新内容失败：${updateError.message}`);
                  errorCount++;
                } else {
                  console.log(`   ✓ 已更新内容图片引用 (翻译 ID: ${translation.id})`);
                }
              }
            }
          }
        }
      }

      // 删除原文件
      await del(img.url);
      console.log(`   ✓ 已删除原文件\n`);
      successCount++;

    } catch (error) {
      console.error(`   ✗ 处理失败：${error}\n`);
      errorCount++;
    }
  }

  // 6. 总结
  console.log('=== 迁移完成 ===');
  console.log(`成功：${successCount} 个`);
  console.log(`失败：${errorCount} 个`);
}

main().catch(console.error);
