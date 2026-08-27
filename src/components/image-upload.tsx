'use client';
import { useState, useRef, useCallback, useEffect } from 'react';

interface ImageUploadProps {
  value: string | null;
  onUploadComplete?: (key: string) => void;
  onChange?: (key: string | null) => void;
  aspectRatio?: number;
  suggestedSize?: string;
  recommendedSize?: string;
  minWidth?: number;
  minHeight?: number;
  label?: string;
  folder?: string;
  lang?: string;
  isProductImage?: boolean;  // If true, upload two sizes (315x315 and 640x640)
  entityId?: string | number;  // 当提供时，用 ID 作为文件名（覆盖式上传）
  slug?: string;  // 产品 slug，用于 SEO 命名
  imageType?: string;  // 图片类型：'product-image' 或 'detail-page'
  customFileName?: string;  // 完整的自定义对象 key 后缀（如 "42/cover.jpg"），启用确定性路径覆盖
}

/* ── 根据宽高比计算裁剪区域高度 ── */
const getContainerHeight = (aspect: number): number => {
  if (aspect >= 3.5) return 200;   // 超宽 Banner (21:6 ≈ 3.5)
  if (aspect >= 2.5) return 240;   // 宽幅
  if (aspect >= 1.4) return 320;   // 横图 (16:9 ≈ 1.78)
  if (aspect >= 0.8) return 400;   // 方图/近方图 (1:1)
  return 460;                       // 竖图（预留）
};

/* ── 根据宽高比计算 Modal 最大宽度 ── */
const getModalMaxWidth = (aspect: number): string => {
  if (aspect >= 3.5) return 'max-w-4xl';  // 896px
  if (aspect >= 1.4) return 'max-w-3xl';  // 768px
  return 'max-w-2xl';                      // 672px
};

/* ── 计算裁剪框在容器中的最大适配尺寸（占可用区域 85%） ── */
const computeCropFrame = (
  containerW: number,
  containerH: number,
  aspectW: number,
  aspectH: number,
) => {
  const pad = 48;
  const availW = containerW - pad;
  const availH = containerH - pad;
  const ar = aspectW / aspectH;

  // 先尝试宽度占 85%
  let frameW = availW * 0.85;
  let frameH = frameW / ar;

  // 如果高度超了，改为高度占 85%
  if (frameH > availH * 0.85) {
    frameH = availH * 0.85;
    frameW = frameH * ar;
  }

  return { width: Math.max(50, Math.round(frameW)), height: Math.max(50, Math.round(frameH)) };
};

export function ImageUpload({
  value,
  onUploadComplete,
  onChange,
  aspectRatio,
  suggestedSize,
  recommendedSize,
  minWidth,
  minHeight,
  label = 'Image',
  folder = 'uploads',
  lang = 'en',
  isProductImage = false,
  entityId,
  slug,
  imageType,
  customFileName,
}: ImageUploadProps) {
  const sizeHint = suggestedSize || recommendedSize;
  const handleComplete = onChange || onUploadComplete || (() => {});
  const [showCrop, setShowCrop] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewTimestamp, setPreviewTimestamp] = useState(Date.now());

  /* ── 图片缩放 & 平移 ── */
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const imgRef = useRef<HTMLImageElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasAutoFit = useRef(false);
  const [cropFrame, setCropFrame] = useState({ width: 300, height: 300 });
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  const [imageDisplayedSize, setImageDisplayedSize] = useState({ width: 0, height: 0 });

  /* ── 用户可编辑的输出尺寸 ── */
  const [userOutputSize, setUserOutputSize] = useState(() => {
    const hint = suggestedSize || recommendedSize;
    if (hint) {
      const wMatch = hint.match(/(\d+)\s*x\s*(\d+)/i);
      if (wMatch) {
        return { width: parseInt(wMatch[1]), height: parseInt(wMatch[2]) };
      }
      const singleMatch = hint.match(/(\d+)/);
      if (singleMatch) {
        const n = parseInt(singleMatch[1]);
        if (n > 0) return { width: n, height: n };
      }
    }
    return { width: 400, height: 400 };
  });

  const outputAspect = userOutputSize.width / userOutputSize.height;
  const containerHeight = getContainerHeight(outputAspect);
  const modalMaxWidth = getModalMaxWidth(outputAspect);

  /* ── 自动适配：图片加载后缩放至填满裁剪框 ── */
  const doAutoFit = useCallback(() => {
    if (!containerRef.current || imageDisplayedSize.width === 0) return;
    const frame = computeCropFrame(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight,
      userOutputSize.width,
      userOutputSize.height,
    );
    const scaleW = frame.width / imageDisplayedSize.width;
    const scaleH = frame.height / imageDisplayedSize.height;
    const fitScale = Math.max(scaleW, scaleH);
    setScale(Math.min(Math.max(fitScale, 0.3), 8));
    setPanX(0);
    setPanY(0);
    hasAutoFit.current = true;
  }, [imageDisplayedSize, userOutputSize.width, userOutputSize.height]);

  useEffect(() => {
    if (showCrop && imageDisplayedSize.width > 0 && cropFrame.width > 0 && !hasAutoFit.current) {
      // 等待一帧确保 DOM 布局完成
      requestAnimationFrame(() => doAutoFit());
    }
  }, [showCrop, imageDisplayedSize, cropFrame, doAutoFit]);

  // 打开裁剪时重置标记
  useEffect(() => {
    if (showCrop) hasAutoFit.current = false;
  }, [showCrop, src]);

  const handleOutputSizeChange = (dim: 'width' | 'height', value: string) => {
    const num = parseInt(value);
    if (!num || num <= 0) return;
    setUserOutputSize((prev) => {
      const next = { ...prev, [dim]: num };
      if (containerRef.current) {
        const frame = computeCropFrame(
          containerRef.current.clientWidth,
          containerRef.current.clientHeight,
          next.width,
          next.height,
        );
        setCropFrame(frame);
      }
      return next;
    });
  };

  /* ── 选择文件 ── */
  const onSelectFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSrc(reader.result as string);
      setShowCrop(true);
      setScale(1);
      setPanX(0);
      setPanY(0);
      setImageNaturalSize({ width: 0, height: 0 });
      setImageDisplayedSize({ width: 0, height: 0 });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }, []);

  /* ── 拖拽平移 ── */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      setIsPanning(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
    },
    [panX, panY],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPanX(panStartRef.current.panX + dx);
      setPanY(panStartRef.current.panY + dy);
    },
    [isPanning],
  );

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  /* ── 缩放 ── */
  const zoomOut = useCallback(() => setScale((s) => Math.max(0.3, +(s - 0.1).toFixed(2))), []);
  const zoomIn = useCallback(() => setScale((s) => Math.min(8, +(s + 0.1).toFixed(2))), []);

  const handleZoomSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setScale(Math.max(0.3, Math.min(8, val)));
  }, []);

  /* ── 裁剪并上传 ── */
  const handleCropAndUpload = useCallback(async () => {
    if (!imgRef.current) return;
    const image = imgRef.current;
    const dispW = image.clientWidth;
    const dispH = image.clientHeight;
    const ratio = image.naturalWidth / dispW;

    const cropCenterX = dispW / 2 - panX / scale;
    const cropCenterY = dispH / 2 - panY / scale;
    const cropDispW = cropFrame.width / scale;
    const cropDispH = cropFrame.height / scale;

    const sx = (cropCenterX - cropDispW / 2) * ratio;
    const sy = (cropCenterY - cropDispH / 2) * ratio;
    const sw = cropDispW * ratio;
    const sh = cropDispH * ratio;

    // 使用用户指定的输出尺寸
    const canvas = document.createElement('canvas');
    canvas.width = userOutputSize.width;
    canvas.height = userOutputSize.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    setUploading(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.95),
      );
      if (!blob) throw new Error('Failed to create image');

      console.log('[ImageUpload] Uploading...', { folder, isProductImage, entityId, blobSize: blob.size });

      // 绕过 FormData，直接发送原始 blob（避免 Vercel Edge 运行时解析 FormData 时的 SharedArrayBuffer 问题）
      const entityParam = entityId ? `&entity_id=${encodeURIComponent(entityId)}` : '';
      const slugParam = slug ? `&slug=${encodeURIComponent(slug)}` : '';
      const imageTypeParam = imageType ? `&image_type=${encodeURIComponent(imageType)}` : '';
      const customFileParam = customFileName ? `&custom_file_name=${encodeURIComponent(customFileName)}` : '';
      const uploadUrl = `/api/upload?folder=${encodeURIComponent(folder)}${isProductImage ? '&product_image=true' : ''}${entityParam}${slugParam}${imageTypeParam}${customFileParam}`;
      console.log('[ImageUpload] Upload URL:', uploadUrl);
      
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'image/jpeg' },
        body: blob,
      });
      
      console.log('[ImageUpload] Response status:', res.status);
      const json = await res.json();
      console.log('[ImageUpload] Response:', json);

      if (json.success) {
        // For product images, store both large and small URLs
        if (isProductImage && json.data.large && json.data.small) {
          // Store as JSON string with both URLs for consistent preview handling
          const imageUrls = JSON.stringify({
            large: json.data.large.url,
            small: json.data.small.url,
          });
          console.log('[ImageUpload] Calling handleComplete with imageUrls:', imageUrls);
          handleComplete(imageUrls);
        } else {
          console.log('[ImageUpload] Calling handleComplete with url:', json.data.url);
          handleComplete(json.data.url);
        }
        // Update preview timestamp to force re-render
        setPreviewTimestamp(Date.now());
        setShowCrop(false);
        setSrc(null);
      } else {
        console.error('[ImageUpload] Upload failed:', json.error);
        alert('Upload failed: ' + json.error);
      }
    } catch (err) {
      console.error('[ImageUpload] Upload error:', err);
      alert('Upload failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
    } finally {
      setUploading(false);
    }
  }, [scale, panX, panY, cropFrame, folder, handleComplete, userOutputSize, entityId, slug, imageType]);

  const handleCancelCrop = useCallback(() => {
    setShowCrop(false);
    setSrc(null);
    setScale(1);
    setPanX(0);
    setPanY(0);
    hasAutoFit.current = false;
  }, []);

  /* ── 计算裁剪框尺寸（自适应容器和宽高比） ── */
  useEffect(() => {
    if (!showCrop || !containerRef.current) return;
    const el = containerRef.current;
    const updateFrame = () => {
      const frame = computeCropFrame(
        el.clientWidth,
        el.clientHeight,
        userOutputSize.width,
        userOutputSize.height,
      );
      setCropFrame(frame);
    };
    updateFrame();
    window.addEventListener('resize', updateFrame);
    return () => window.removeEventListener('resize', updateFrame);
  }, [showCrop, userOutputSize.width, userOutputSize.height, containerHeight]);

  const t = (zh: string, en: string) => (lang === 'zh' ? zh : en);

  // Add timestamp to force re-render when URL doesn't change
  const previewSrc = value 
    ? (value.startsWith('http') 
        ? (value.includes('?') ? `${value}&t=${previewTimestamp}` : `${value}?t=${previewTimestamp}`)
        : `/api/image?key=${encodeURIComponent(value)}&t=${previewTimestamp}`)
    : null;

  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1 text-left">
        {label}
        {sizeHint && (
          <span className="text-[10px] text-muted-foreground/60 ml-1">({sizeHint})</span>
        )}
      </label>

      {/* 预览 */}
      {value && !showCrop && (
        <div className="mb-2 relative group">
          <img
            src={previewSrc}
            alt="Preview"
            className="rounded-lg border border-border max-h-32 object-cover"
          />
        </div>
      )}

      {/* 上传按钮 */}
      {!showCrop && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="rounded-lg border border-dashed border-border bg-secondary/50 px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
          >
            {uploading
              ? t('上传中...', 'Uploading...')
              : value
                ? t('替换图片', 'Replace Image')
                : t('选择图片', 'Select Image')}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => handleComplete('')}
              className="text-xs text-destructive hover:underline"
            >
              {t('移除', 'Remove')}
            </button>
          )}
          <input ref={inputRef} type="file" accept="image/*" onChange={onSelectFile} className="hidden" />
        </div>
      )}

      {/* 裁剪弹窗 */}
      {showCrop && src && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className={`w-full ${modalMaxWidth} rounded-2xl border border-border bg-card p-4 max-h-[92vh] overflow-auto`}>
            <h3 className="text-sm font-semibold mb-3">
              {t('裁剪图片', 'Crop Image')}
              {sizeHint && (
                <span className="ml-2 text-xs font-normal text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                  {t('要求尺寸', 'Required')}: {sizeHint.replace('px', '')}px
                </span>
              )}
            </h3>

            {/* 可编辑的输出尺寸 */}
            <div className="flex items-center justify-center gap-2 mb-3 px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
              <span className="text-sm text-gray-600">
                {t('输出尺寸', 'Output size')}:
              </span>
              <input
                type="number"
                value={userOutputSize.width}
                onChange={(e) => handleOutputSizeChange('width', e.target.value)}
                className="w-16 px-1 py-0.5 text-center font-mono font-semibold text-purple-600 border border-gray-300 rounded bg-white"
                min={1}
              />
              <span className="text-gray-400">×</span>
              <input
                type="number"
                value={userOutputSize.height}
                onChange={(e) => handleOutputSizeChange('height', e.target.value)}
                className="w-16 px-1 py-0.5 text-center font-mono font-semibold text-purple-600 border border-gray-300 rounded bg-white"
                min={1}
              />
              <span className="text-sm text-gray-500">px</span>
              {(minWidth || minHeight) && (
                <span className="text-xs text-gray-400 ml-2">
                  ({t('最小', 'Min')}: {minWidth || '—'} × {minHeight || '—'}px)
                </span>
              )}
            </div>

            {/* 裁剪区域 —— 高度动态自适应 */}
            <div
              ref={containerRef}
              className="relative bg-[#1a1a1a] rounded-lg mb-4 overflow-hidden"
              style={{
                height: containerHeight,
                cursor: isPanning ? 'grabbing' : 'grab',
                userSelect: 'none',
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* 固定裁剪框 */}
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  width: cropFrame.width,
                  height: cropFrame.height,
                  transform: 'translate(-50%, -50%)',
                  border: '2px solid #fff',
                  boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
                  zIndex: 2,
                  pointerEvents: 'none',
                }}
              />
              {/* 可缩放/拖拽的图片 */}
              <img
                ref={imgRef}
                src={src}
                alt="Crop"
                draggable={false}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  setImageNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
                  setImageDisplayedSize({ width: img.clientWidth, height: img.clientHeight });
                }}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  maxHeight: '100%',
                  maxWidth: '100%',
                  objectFit: 'contain',
                  transform: `translate(-50%, -50%) scale(${scale}) translate(${panX / scale}px, ${panY / scale}px)`,
                  transformOrigin: 'center center',
                  transition: isPanning ? 'none' : 'transform 0.15s ease-out',
                  pointerEvents: 'none',
                }}
              />
            </div>

            {/* 缩放控制 */}
            <div className="flex items-center justify-center gap-3 mb-4 bg-white rounded-lg py-2 px-4 shadow-sm">
              <button
                type="button"
                onClick={zoomOut}
                className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-lg font-bold text-gray-700 transition-colors"
              >
                −
              </button>
              <input
                type="range"
                min="0.3"
                max="8"
                step="0.01"
                value={scale}
                onChange={handleZoomSlider}
                className="w-28 h-2 cursor-pointer accent-purple-600"
              />
              <button
                type="button"
                onClick={zoomIn}
                className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-lg font-bold text-gray-700 transition-colors"
              >
                +
              </button>
              <span className="text-sm text-gray-500 min-w-[50px] text-center tabular-nums">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={doAutoFit}
                className="ml-1 text-xs px-2 py-1 rounded bg-purple-50 text-purple-600 hover:bg-purple-100 transition-colors font-medium"
              >
                {t('适应', 'Fit')}
              </button>
            </div>

            {/* 按钮 */}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelCrop}
                className="rounded-lg border border-border px-4 py-2 text-sm"
              >
                {t('取消', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleCropAndUpload}
                disabled={uploading}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {uploading ? t('上传中...', 'Uploading...') : t('裁剪并上传', 'Crop & Upload')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
