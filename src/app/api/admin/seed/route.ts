import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST() {
  try {
    const client = getSupabaseClient();

    // 1. Create categories
    const { data: categories, error: catError } = await client
      .from('categories')
      .upsert(
        [
          { slug: 'pod-systems', icon: '🔋', sort_order: 1, is_active: true },
          { slug: 'box-mods', icon: '🧱', sort_order: 2, is_active: true },
          { slug: 'disposable-vapes', icon: '🫧', sort_order: 3, is_active: true },
          { slug: 'e-liquids', icon: '💧', sort_order: 4, is_active: true },
          { slug: 'accessories', icon: '🔧', sort_order: 5, is_active: true },
        ],
        { onConflict: 'slug' }
      )
      .select();
    if (catError) throw new Error(`Categories failed: ${catError.message}`);

    // 2. Create category translations
    const catTransRows: { category_id: number | null; language: string; name: string }[] = [];
    for (const cat of categories || []) {
      catTransRows.push(
        { category_id: (cat as Record<string, unknown>).id as number, language: 'en', name: cat.slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) },
        { category_id: (cat as Record<string, unknown>).id as number, language: 'zh', name: ({ 'pod-systems': '换弹式设备', 'box-mods': '盒子主机', 'disposable-vapes': '一次性电子烟', 'e-liquids': '烟油', 'accessories': '配件' } as Record<string, string>)[cat.slug as string] || cat.slug as string }
      );
    }
    // Delete old translations first
    for (const cat of categories || []) {
      await client.from('category_translations').delete().eq('category_id', (cat as Record<string, unknown>).id as number);
    }
    const { error: ctError } = await client.from('category_translations').insert(catTransRows);
    if (ctError) throw new Error(`Category translations failed: ${ctError.message}`);

    // 3. Create stores
    const { data: stores, error: storeError } = await client
      .from('stores')
      .upsert(
        [
          { slug: 'vaporfi', logo_url: null, website_url: 'https://www.vaporfi.com', is_active: true },
          { slug: 'elementvape', logo_url: null, website_url: 'https://www.elementvape.com', is_active: true },
          { slug: 'vapedeal', logo_url: null, website_url: 'https://www.vapedeal.com', is_active: true },
          { slug: 'myvaporstore', logo_url: null, website_url: 'https://www.myvaporstore.com', is_active: true },
          { slug: 'eightvape', logo_url: null, website_url: 'https://www.eightvape.com', is_active: true },
        ],
        { onConflict: 'slug' }
      )
      .select();
    if (storeError) throw new Error(`Stores failed: ${storeError.message}`);

    // 4. Create store translations
    const storeTransRows: { store_id: number | null; language: string; name: string }[] = [];
    for (const store of stores || []) {
      storeTransRows.push(
        { store_id: (store as Record<string, unknown>).id as number, language: 'en', name: ({ vaporfi: 'VaporFi', elementvape: 'Element Vape', vapedeal: 'VapeDeal', myvaporstore: 'MyVaporStore', eightvape: 'EightVape' } as Record<string, string>)[store.slug as string] || store.slug as string },
        { store_id: (store as Record<string, unknown>).id as number, language: 'zh', name: ({ vaporfi: 'VaporFi', elementvape: 'Element Vape', vapedeal: 'VapeDeal', myvaporstore: 'MyVaporStore', eightvape: 'EightVape' } as Record<string, string>)[store.slug as string] || store.slug as string }
      );
    }
    for (const store of stores || []) {
      await client.from('store_translations').delete().eq('store_id', (store as Record<string, unknown>).id as number);
    }
    const { error: stError } = await client.from('store_translations').insert(storeTransRows);
    if (stError) throw new Error(`Store translations failed: ${stError.message}`);

    // 5. Create products
    const podCatId = (categories?.find((c: Record<string, unknown>) => c.slug === 'pod-systems') as Record<string, unknown>)?.id as number;
    const modCatId = (categories?.find((c: Record<string, unknown>) => c.slug === 'box-mods') as Record<string, unknown>)?.id as number;
    const dispCatId = (categories?.find((c: Record<string, unknown>) => c.slug === 'disposable-vapes') as Record<string, unknown>)?.id as number;
    const liqCatId = (categories?.find((c: Record<string, unknown>) => c.slug === 'e-liquids') as Record<string, unknown>)?.id as number;

    const productDefs = [
      { slug: 'oxva-xlim-3-ultra', category_id: podCatId, image_url: 'https://images.unsplash.com/photo-1608130257712-0b2a0e6e0911?w=400&h=400&fit=crop', is_featured: true },
      { slug: 'voopoo-drag-x2', category_id: modCatId, image_url: 'https://images.unsplash.com/photo-1579965342575-16428a7c8881?w=400&h=400&fit=crop', is_featured: true },
      { slug: 'geekvape-aegis-legend-3', category_id: modCatId, image_url: 'https://images.unsplash.com/photo-1616400619175-5beda3a17896?w=400&h=400&fit=crop', is_featured: false },
      { slug: 'elfbar-bc10000', category_id: dispCatId, image_url: 'https://images.unsplash.com/photo-1561241717-b0207b93a8fd?w=400&h=400&fit=crop', is_featured: true },
      { slug: 'lost-mary-mo20000', category_id: dispCatId, image_url: 'https://images.unsplash.com/photo-1587563871167-1ee9c731aefb?w=400&h=400&fit=crop', is_featured: false },
      { slug: 'nkd-100-salt', category_id: liqCatId, image_url: 'https://images.unsplash.com/photo-1615947217870-6a1e11b18898?w=400&h=400&fit=crop', is_featured: false },
      { slug: 'uwell-caliburn-g3', category_id: podCatId, image_url: 'https://images.unsplash.com/photo-1587213811864-46e59f6873b1?w=400&h=400&fit=crop', is_featured: true },
      { slug: 'smok-novo-4', category_id: podCatId, image_url: 'https://images.unsplash.com/photo-1591076482161-42ce6da69f67?w=400&h=400&fit=crop', is_featured: false },
      { slug: 'vaporesso-xros-4', category_id: podCatId, image_url: 'https://images.unsplash.com/photo-1560185127-6a431720fed6?w=400&h=400&fit=crop', is_featured: false },
      { slug: 'geekvape-wenax-h2', category_id: podCatId, image_url: 'https://images.unsplash.com/photo-1608130257583-0418a0d3a18e?w=400&h=400&fit=crop', is_featured: false },
    ];

    // Delete existing products with these slugs
    const slugs = productDefs.map((p) => p.slug);
    await client.from('products').delete().in('slug', slugs);

    const { data: products, error: prodError } = await client
      .from('products')
      .insert(productDefs.map((p) => ({ ...p, is_active: true })))
      .select();
    if (prodError) throw new Error(`Products failed: ${prodError.message}`);

    // 6. Create product translations
    const prodTransMap: Record<string, { en: { name: string; description: string; features: string[]; specs: Record<string, string> }; zh: { name: string; description: string; features: string[]; specs: Record<string, string> } }> = {
      'oxva-xlim-3-ultra': {
        en: { name: 'OXVA Xlim 3 Ultra Pod System Kit', description: 'The OXVA Xlim 3 Ultra is a powerful and compact pod system featuring a 1500mAh battery, 4ml pod capacity, and adjustable wattage up to 35W.', features: ['1500mAh Built-in Battery', '4ml Pod Capacity', '35W Max Output', '0.42" OLED Screen', 'Type-C Fast Charging'], specs: { Battery: '1500mAh', 'Pod Capacity': '4ml', 'Max Wattage': '35W', 'Display': '0.42" OLED', Charging: 'Type-C' } },
        zh: { name: 'OXVA Xlim 3 Ultra 换弹套装', description: 'OXVA Xlim 3 Ultra 是一款强大且紧凑的换弹设备，配备1500mAh电池、4ml烟弹容量和最高35W可调功率。', features: ['1500mAh内置电池', '4ml烟弹容量', '最高35W输出', '0.42英寸OLED屏幕', 'Type-C快充'], specs: { 电池: '1500mAh', 烟弹容量: '4ml', 最高功率: '35W', 显示屏: '0.42英寸OLED', 充电: 'Type-C' } },
      },
      'voopoo-drag-x2': {
        en: { name: 'VooPoo Drag X2 Pod Mod Kit', description: 'The VooPoo Drag X2 delivers up to 80W with a single 18650 battery, featuring the GENE.TT 2.0 chip for smart mode and Turbo mode.', features: ['80W Max Output', 'Single 18650 Battery', 'GENE.TT 2.0 Chip', '5.5ml Pod Capacity', 'Smart & Turbo Mode'], specs: { Battery: '18650 (Not Included)', 'Pod Capacity': '5.5ml', 'Max Wattage': '80W', Chip: 'GENE.TT 2.0', Weight: '135g' } },
        zh: { name: 'VooPoo Drag X2 主机套装', description: 'VooPoo Drag X2 最高支持80W输出，采用单18650电池，搭载GENE.TT 2.0芯片，支持智能模式和Turbo模式。', features: ['最高80W输出', '单18650电池', 'GENE.TT 2.0芯片', '5.5ml烟弹容量', '智能与Turbo模式'], specs: { 电池: '18650（不含）', 烟弹容量: '5.5ml', 最高功率: '80W', 芯片: 'GENE.TT 2.0', 重量: '135g' } },
      },
      'geekvape-aegis-legend-3': {
        en: { name: 'GeekVape Aegis Legend 3 Box Mod Kit', description: 'The Aegis Legend 3 is IP68 rated, powered by dual 18650 batteries with up to 200W output and the A-Lock switch for safe carrying.', features: ['200W Max Output', 'Dual 18650 Batteries', 'IP68 Waterproof', 'A-Lock Switch', 'Z Fli Sub-Ohm Tank'], specs: { Battery: 'Dual 18650', 'Max Wattage': '200W', Rating: 'IP68', Tank: 'Z Fli 5.5ml', Weight: '205g' } },
        zh: { name: 'GeekVape Aegis Legend 3 套装', description: 'Aegis Legend 3 具IP68防护等级，采用双18650电池，最高200W输出，配备A-Lock安全开关。', features: ['最高200W输出', '双18650电池', 'IP68防水', 'A-Lock安全开关', 'Z Fli雾化器'], specs: { 电池: '双18650', 最高功率: '200W', 防护等级: 'IP68', 雾化器: 'Z Fli 5.5ml', 重量: '205g' } },
      },
      'elfbar-bc10000': {
        en: { name: 'ElfBar BC10000 Disposable Vape', description: 'The ElfBar BC10000 offers up to 10000 puffs with a 650mAh rechargeable battery and 18ml e-liquid capacity.', features: ['10000 Puffs', '650mAh Rechargeable', '18ml E-Liquid', 'Smart Display', 'Multiple Flavors'], specs: { Puffs: 'Up to 10000', Battery: '650mAh', 'E-Liquid': '18ml', Display: 'Smart LED', Charging: 'Type-C' } },
        zh: { name: 'ElfBar BC10000 一次性电子烟', description: 'ElfBar BC10000 可提供高达10000口抽吸，配备650mAh可充电电池和18ml烟油容量。', features: ['10000口', '650mAh可充电', '18ml烟油', '智能显示屏', '多种口味'], specs: { 口数: '10000口', 电池: '650mAh', 烟油: '18ml', 显示: '智能LED', 充电: 'Type-C' } },
      },
      'lost-mary-mo20000': {
        en: { name: 'Lost Mary MO20000 Disposable Vape', description: 'The Lost Mary MO20000 delivers up to 20000 puffs with a large e-liquid display and rechargeable battery.', features: ['20000 Puffs', 'Rechargeable Battery', 'Large Display', 'Multiple Flavors', 'Adjustable Airflow'], specs: { Puffs: 'Up to 20000', Battery: '800mAh', Display: 'Animation', Charging: 'Type-C', Airflow: 'Adjustable' } },
        zh: { name: 'Lost Mary MO20000 一次性电子烟', description: 'Lost Mary MO20000 提供高达20000口抽吸，配备大容量烟油显示屏和可充电电池。', features: ['20000口', '可充电电池', '大显示屏', '多种口味', '可调节气流'], specs: { 口数: '20000口', 电池: '800mAh', 显示: '动画屏', 充电: 'Type-C', 气流: '可调' } },
      },
      'nkd-100-salt': {
        en: { name: 'NKD 100 Salt E-Liquid', description: 'NKD 100 Salt offers premium nicotine salt e-liquid in various flavors, perfect for pod systems with a smooth throat hit.', features: ['Nicotine Salt Formula', '35mg/50mg Options', 'Multiple Flavors', 'Smooth Throat Hit', '30ml Bottle'], specs: { Type: 'Nicotine Salt', Strength: '35mg / 50mg', Size: '30ml', VG: '50%', Flavors: '10+' } },
        zh: { name: 'NKD 100 Salt 尼古丁盐烟油', description: 'NKD 100 Salt 提供优质尼古丁盐烟油，多种口味可选，适合换弹设备使用，口感柔顺。', features: ['尼古丁盐配方', '35mg/50mg可选', '多种口味', '柔顺击喉感', '30ml瓶装'], specs: { 类型: '尼古丁盐', 浓度: '35mg / 50mg', 容量: '30ml', VG: '50%', 口味: '10+' } },
      },
      'uwell-caliburn-g3': {
        en: { name: 'Uwell Caliburn G3 Pod System Kit', description: 'The Uwell Caliburn G3 features a 900mAh battery, 2.5ml pod capacity, and Pro-FOCS flavor testing technology for exceptional taste.', features: ['900mAh Battery', '2.5ml Pod', 'Pro-FOCS Technology', 'Dual Firing Mechanism', 'Type-C Charging'], specs: { Battery: '900mAh', 'Pod Capacity': '2.5ml', Technology: 'Pro-FOCS', Firing: 'Draw/Button', Charging: 'Type-C' } },
        zh: { name: 'Uwell Caliburn G3 换弹套装', description: 'Uwell Caliburn G3 配备900mAh电池、2.5ml烟弹容量和Pro-FOCS风味测试技术，口感出众。', features: ['900mAh电池', '2.5ml烟弹', 'Pro-FOCS技术', '双重点火方式', 'Type-C充电'], specs: { 电池: '900mAh', 烟弹容量: '2.5ml', 技术: 'Pro-FOCS', 点火: '气动/按键', 充电: 'Type-C' } },
      },
      'smok-novo-4': {
        en: { name: 'SMOK Novo 4 Pod System Kit', description: 'The SMOK Novo 4 comes with an 800mAh battery, adjustable airflow, and interchangeable coils for a customizable experience.', features: ['800mAh Battery', 'Adjustable Airflow', 'Interchangeable Coils', '2ml Pod Capacity', 'LED Indicator'], specs: { Battery: '800mAh', 'Pod Capacity': '2ml', Airflow: 'Adjustable', Coils: 'LP1 Series', Display: 'LED' } },
        zh: { name: 'SMOK Novo 4 换弹套装', description: 'SMOK Novo 4 配备800mAh电池、可调节气流和可更换雾化芯，打造个性化体验。', features: ['800mAh电池', '可调气流', '可更换雾化芯', '2ml烟弹容量', 'LED指示灯'], specs: { 电池: '800mAh', 烟弹容量: '2ml', 气流: '可调', 雾化芯: 'LP1系列', 显示: 'LED' } },
      },
      'vaporesso-xros-4': {
        en: { name: 'Vaporesso XROS 4 Pod System Kit', description: 'The Vaporesso XROS 4 features COREX technology, 1000mAh battery, and 3ml pod capacity for consistent flavor delivery.', features: ['1000mAh Battery', '3ml Pod Capacity', 'COREX Technology', 'Pulse Mode', 'Type-C Charging'], specs: { Battery: '1000mAh', 'Pod Capacity': '3ml', Technology: 'COREX', Mode: 'Pulse', Charging: 'Type-C' } },
        zh: { name: 'Vaporesso XROS 4 换弹套装', description: 'Vaporesso XROS 4 采用COREX技术，配备1000mAh电池和3ml烟弹容量，口味持久稳定。', features: ['1000mAh电池', '3ml烟弹容量', 'COREX技术', '脉冲模式', 'Type-C充电'], specs: { 电池: '1000mAh', 烟弹容量: '3ml', 技术: 'COREX', 模式: '脉冲', 充电: 'Type-C' } },
      },
      'geekvape-wenax-h2': {
        en: { name: 'GeekVape Wenax H2 Pod Kit', description: 'The GeekVape Wenax H2 is a sleek pod system with 1050mAh battery, 2.5ml pod, and three power levels for versatile vaping.', features: ['1050mAh Battery', '2.5ml Pod', '3 Power Levels', 'Draw-Activated', 'Haptic Feedback'], specs: { Battery: '1050mAh', 'Pod Capacity': '2.5ml', 'Power Levels': '3', Activation: 'Draw', Feedback: 'Haptic' } },
        zh: { name: 'GeekVape Wenax H2 换弹套装', description: 'GeekVape Wenax H2 是一款时尚换弹设备，配备1050mAh电池、2.5ml烟弹和三档功率调节。', features: ['1050mAh电池', '2.5ml烟弹', '3档功率', '气动点火', '震动反馈'], specs: { 电池: '1050mAh', 烟弹容量: '2.5ml', 功率档位: '3档', 点火: '气动', 反馈: '震动' } },
      },
    };

    const prodTransRows: { product_id: number; language: string; name: string; description: string; features: string; specs: string }[] = [];
    for (const product of products || []) {
      const transData = prodTransMap[product.slug as string];
      if (!transData) continue;
      for (const [lang, t] of Object.entries(transData)) {
        prodTransRows.push({
          product_id: (product as Record<string, unknown>).id as number,
          language: lang,
          name: t.name,
          description: t.description,
          features: JSON.stringify(t.features),
          specs: JSON.stringify(t.specs),
        });
      }
    }
    const { error: ptError } = await client.from('product_translations').insert(prodTransRows);
    if (ptError) throw new Error(`Product translations failed: ${ptError.message}`);

    // 7. Create product prices
    const storeMap: Record<string, number> = {};
    for (const store of stores || []) {
      storeMap[store.slug as string] = (store as Record<string, unknown>).id as number;
    }

    const priceDefs: { product_slug: string; store_slug: string; current_price: string; original_price: string; product_url: string; discount_percent: number }[] = [
      { product_slug: 'oxva-xlim-3-ultra', store_slug: 'elementvape', current_price: '24.99', original_price: '34.99', product_url: 'https://www.elementvape.com/oxva-xlim-3-ultra', discount_percent: 29 },
      { product_slug: 'oxva-xlim-3-ultra', store_slug: 'vapedeal', current_price: '22.49', original_price: '34.99', product_url: 'https://www.vapedeal.com/oxva-xlim-3-ultra', discount_percent: 36 },
      { product_slug: 'oxva-xlim-3-ultra', store_slug: 'vaporfi', current_price: '29.99', original_price: '34.99', product_url: 'https://www.vaporfi.com/oxva-xlim-3-ultra', discount_percent: 14 },
      { product_slug: 'oxva-xlim-3-ultra', store_slug: 'eightvape', current_price: '21.99', original_price: '34.99', product_url: 'https://www.eightvape.com/oxva-xlim-3-ultra', discount_percent: 37 },
      { product_slug: 'voopoo-drag-x2', store_slug: 'elementvape', current_price: '39.99', original_price: '54.99', product_url: 'https://www.elementvape.com/voopoo-drag-x2', discount_percent: 27 },
      { product_slug: 'voopoo-drag-x2', store_slug: 'myvaporstore', current_price: '42.99', original_price: '54.99', product_url: 'https://www.myvaporstore.com/voopoo-drag-x2', discount_percent: 22 },
      { product_slug: 'voopoo-drag-x2', store_slug: 'eightvape', current_price: '37.99', original_price: '54.99', product_url: 'https://www.eightvape.com/voopoo-drag-x2', discount_percent: 31 },
      { product_slug: 'geekvape-aegis-legend-3', store_slug: 'elementvape', current_price: '59.99', original_price: '79.99', product_url: 'https://www.elementvape.com/geekvape-aegis-legend-3', discount_percent: 25 },
      { product_slug: 'geekvape-aegis-legend-3', store_slug: 'vapedeal', current_price: '54.99', original_price: '79.99', product_url: 'https://www.vapedeal.com/geekvape-aegis-legend-3', discount_percent: 31 },
      { product_slug: 'geekvape-aegis-legend-3', store_slug: 'vaporfi', current_price: '64.99', original_price: '79.99', product_url: 'https://www.vaporfi.com/geekvape-aegis-legend-3', discount_percent: 19 },
      { product_slug: 'elfbar-bc10000', store_slug: 'vapedeal', current_price: '14.99', original_price: '19.99', product_url: 'https://www.vapedeal.com/elfbar-bc10000', discount_percent: 25 },
      { product_slug: 'elfbar-bc10000', store_slug: 'elementvape', current_price: '16.99', original_price: '19.99', product_url: 'https://www.elementvape.com/elfbar-bc10000', discount_percent: 15 },
      { product_slug: 'elfbar-bc10000', store_slug: 'eightvape', current_price: '13.49', original_price: '19.99', product_url: 'https://www.eightvape.com/elfbar-bc10000', discount_percent: 33 },
      { product_slug: 'lost-mary-mo20000', store_slug: 'vapedeal', current_price: '16.99', original_price: '22.99', product_url: 'https://www.vapedeal.com/lost-mary-mo20000', discount_percent: 26 },
      { product_slug: 'lost-mary-mo20000', store_slug: 'elementvape', current_price: '18.99', original_price: '22.99', product_url: 'https://www.elementvape.com/lost-mary-mo20000', discount_percent: 17 },
      { product_slug: 'nkd-100-salt', store_slug: 'vaporfi', current_price: '12.99', original_price: '17.99', product_url: 'https://www.vaporfi.com/nkd-100-salt', discount_percent: 28 },
      { product_slug: 'nkd-100-salt', store_slug: 'myvaporstore', current_price: '11.49', original_price: '17.99', product_url: 'https://www.myvaporstore.com/nkd-100-salt', discount_percent: 36 },
      { product_slug: 'uwell-caliburn-g3', store_slug: 'elementvape', current_price: '27.99', original_price: '35.99', product_url: 'https://www.elementvape.com/uwell-caliburn-g3', discount_percent: 22 },
      { product_slug: 'uwell-caliburn-g3', store_slug: 'vapedeal', current_price: '25.49', original_price: '35.99', product_url: 'https://www.vapedeal.com/uwell-caliburn-g3', discount_percent: 29 },
      { product_slug: 'uwell-caliburn-g3', store_slug: 'eightvape', current_price: '24.99', original_price: '35.99', product_url: 'https://www.eightvape.com/uwell-caliburn-g3', discount_percent: 31 },
      { product_slug: 'smok-novo-4', store_slug: 'elementvape', current_price: '19.99', original_price: '27.99', product_url: 'https://www.elementvape.com/smok-novo-4', discount_percent: 29 },
      { product_slug: 'smok-novo-4', store_slug: 'myvaporstore', current_price: '21.99', original_price: '27.99', product_url: 'https://www.myvaporstore.com/smok-novo-4', discount_percent: 21 },
      { product_slug: 'vaporesso-xros-4', store_slug: 'elementvape', current_price: '26.99', original_price: '33.99', product_url: 'https://www.elementvape.com/vaporesso-xros-4', discount_percent: 21 },
      { product_slug: 'vaporesso-xros-4', store_slug: 'vaporfi', current_price: '28.99', original_price: '33.99', product_url: 'https://www.vaporfi.com/vaporesso-xros-4', discount_percent: 15 },
      { product_slug: 'vaporesso-xros-4', store_slug: 'eightvape', current_price: '24.99', original_price: '33.99', product_url: 'https://www.eightvape.com/vaporesso-xros-4', discount_percent: 27 },
      { product_slug: 'geekvape-wenax-h2', store_slug: 'elementvape', current_price: '22.99', original_price: '29.99', product_url: 'https://www.elementvape.com/geekvape-wenax-h2', discount_percent: 23 },
      { product_slug: 'geekvape-wenax-h2', store_slug: 'vapedeal', current_price: '20.99', original_price: '29.99', product_url: 'https://www.vapedeal.com/geekvape-wenax-h2', discount_percent: 30 },
    ];

    const productMap: Record<string, number> = {};
    for (const product of products || []) {
      productMap[product.slug as string] = (product as Record<string, unknown>).id as number;
    }

    const priceRows = priceDefs.map((p) => ({
      product_id: productMap[p.product_slug],
      store_id: storeMap[p.store_slug],
      current_price: p.current_price,
      original_price: p.original_price,
      product_url: p.product_url,
      in_stock: true,
      discount_percent: p.discount_percent,
    })).filter((p) => p.product_id && p.store_id);

    const { error: priceError } = await client.from('product_prices').insert(priceRows);
    if (priceError) throw new Error(`Prices failed: ${priceError.message}`);

    return NextResponse.json({
      success: true,
      message: `Seeded ${products?.length || 0} products, ${categories?.length || 0} categories, ${stores?.length || 0} stores, ${priceRows.length} prices`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
