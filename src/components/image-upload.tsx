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
}

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
}: ImageUploadProps) {
  const sizeHint = suggestedSize || recommendedSize;
  const handleComplete = onChange || onUploadComplete || (() => {});
  const [showCrop, setShowCrop] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  /* ── 图片缩放 & 平移 ── */
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const imgRef = useRef<HTMLImageElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
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

  const handleOutputSizeChange = (dim: 'width' | 'height', value: string) => {
    const num = parseInt(value);
    if (!num || num <= 0) return;
    setUserOutputSize(prev => {
      const next = { ...prev, [dim]: num };
      // 只更新裁图框的比例，不改变图片缩放和位置
      const ratio = next.width / next.height;
      const maxW = containerRef.current?.clientWidth ?? 400;
      const maxH = containerRef.current?.clientHeight ?? 400;
      const imgW = imageNaturalSize.width || maxW;
      const imgH = imageNaturalSize.height || maxH;
      let cw: number, ch: number;
      if (ratio >= 1) {
        cw = Math.min(maxW * 0.9, imgW);
        ch = cw / ratio;
        if (ch > maxH * 0.9 || ch > imgH) {
          ch = Math.min(maxH * 0.9, imgH);
          cw = ch * ratio;
        }
      } else {
        ch = Math.min(maxH * 0.9, imgH);
        cw = ch * ratio;
        if (cw > maxW * 0.9 || cw > imgW) {
          cw = Math.min(maxW * 0.9, imgW);
          ch = cw / ratio;
        }
      }
      setCropFrame({ width: Math.round(cw), height: Math.round(ch) });
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
  const zoomOut = useCallback(() => setScale((s) => Math.max(0.5, +(s - 0.02).toFixed(2))), []);
  const zoomIn = useCallback(() => setScale((s) => Math.min(3, +(s + 0.02).toFixed(2))), []);

  const handleZoomSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setScale(Math.max(0.5, val));
  }, []);

  // 缩放时更新显示尺寸
  useEffect(() => {
    if (imgRef.current && imageNaturalSize.width > 0) {
      setImageDisplayedSize({
        width: imgRef.current.clientWidth,
        height: imgRef.current.clientHeight,
      });
    }
  }, [scale, imageNaturalSize.width]);

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
        canvas.toBlob(resolve, 'image/webp', 1.0),
      );
      if (!blob) throw new Error('Failed to create image');

      const file = new File([blob], `crop-${Date.now()}.webp`, { type: 'image/webp' });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', folder);
      if (isProductImage) {
        formData.append('product_image', 'true');
      }

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const json = await res.json();

      if (json.success) {
        // For product images, store both large and small URLs
        if (isProductImage && json.data.large && json.data.small) {
          // Store as JSON string with both URLs
          const imageUrls = JSON.stringify({
            large: json.data.large.url,
            small: json.data.small.url,
          });
          handleComplete(imageUrls);
        } else {
          handleComplete(json.data.key);
        }
        setShowCrop(false);
        setSrc(null);
      } else {
        alert('Upload failed: ' + json.error);
      }
    } catch {
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  }, [scale, panX, panY, cropFrame, folder, handleComplete, userOutputSize]);

  const handleCancelCrop = useCallback(() => {
    setShowCrop(false);
    setSrc(null);
    setScale(1);
    setPanX(0);
    setPanY(0);
  }, []);

  /* ── 计算裁剪框尺寸 ── */
  useEffect(() => {
    if (!showCrop || !containerRef.current) return;
    const el = containerRef.current;
    const updateFrame = () => {
      const { clientWidth: cw, clientHeight: ch } = el;
      const pad = 32;
      const maxW = cw - pad;
      const maxH = ch - pad;
      // 优先使用用户指定的输出尺寸比例
      const ar = userOutputSize.width / userOutputSize.height;
      
      // 默认目标尺寸：640x640px（当 aspectRatio 为 1 时）
      const targetSize = 640;
      let targetW = targetSize;
      let targetH = targetSize / ar;
      
      // 如果目标尺寸超过容器大小，则缩小到容器大小
      let w: number, h: number;
      if (targetW > maxW || targetH > maxH) {
        if (maxW / maxH > ar) {
          h = maxH;
          w = h * ar;
        } else {
          w = maxW;
          h = w / ar;
        }
      } else {
        w = targetW;
        h = targetH;
      }
      setCropFrame({ width: Math.round(w), height: Math.round(h) });
    };
    updateFrame();
    window.addEventListener('resize', updateFrame);
    return () => window.removeEventListener('resize', updateFrame);
  }, [showCrop, userOutputSize.width, userOutputSize.height]);

  const t = (zh: string, en: string) => (lang === 'zh' ? zh : en);

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
            src={value.startsWith('http') ? value : `/api/image?key=${encodeURIComponent(value)}`}
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
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-card p-4 max-h-[90vh] overflow-auto">
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

            {/* 裁剪区域 */}
            <div
              ref={containerRef}
              className="relative bg-[#1a1a1a] rounded-lg mb-4 overflow-hidden"
              style={{
                height: 350,
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
                min="0.5"
                max="3"
                step="0.02"
                value={scale}
                onChange={handleZoomSlider}
                className="w-24 h-2 cursor-pointer accent-purple-600"
              />
              <button
                type="button"
                onClick={zoomIn}
                className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-lg font-bold text-gray-700 transition-colors"
              >
                +
              </button>
              <span className="text-sm text-gray-500 min-w-[50px] text-center">
                {(Math.round(scale * 1000) / 10).toFixed(0)}%
              </span>
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
