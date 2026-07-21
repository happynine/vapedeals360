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

  // Calculate the output crop size in real pixels
  const outputSize = (() => {
    if (!imageNaturalSize.width || !imageDisplayedSize.width) return { width: 0, height: 0 };
    const ratio = imageNaturalSize.width / imageDisplayedSize.width;
    const outputW = Math.round((cropFrame.width / scale) * ratio);
    const outputH = Math.round((cropFrame.height / scale) * ratio);
    return { width: outputW, height: outputH };
  })();

  // Calculate minimum scale to ensure output is at least minWidth x minHeight
  const minScale = (() => {
    if (!minWidth || !minHeight || !imageNaturalSize.width || !imageDisplayedSize.width) return 0.5;
    const ratio = imageNaturalSize.width / imageDisplayedSize.width;
    const scaleForWidth = (cropFrame.width * ratio) / minWidth;
    const scaleForHeight = (cropFrame.height * ratio) / minHeight;
    return Math.max(0.5, Math.min(scaleForWidth, scaleForHeight));
  })();

  // Calculate maximum scale (3x or limited by min size)
  const maxScale = 3;

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
  const zoomOut = useCallback(() => setScale((s) => Math.max(minScale, +(s - 0.02).toFixed(2))), [minScale]);
  const zoomIn = useCallback(() => setScale((s) => Math.min(3, +(s + 0.02).toFixed(2))), []);
  const handleZoomSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  const val = parseFloat(e.target.value);
  setScale(Math.max(minScale, val));
}, [minScale]);

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

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
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

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (json.success) {
        handleComplete(json.data.key);
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
  }, [scale, panX, panY, cropFrame, folder, handleComplete]);

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
      const ar = aspectRatio || 1;
      let w: number, h: number;
      if (maxW / maxH > ar) {
        h = maxH;
        w = h * ar;
      } else {
        w = maxW;
        h = w / ar;
      }
      setCropFrame({ width: Math.round(w), height: Math.round(h) });
    };
    updateFrame();
    window.addEventListener('resize', updateFrame);
    return () => window.removeEventListener('resize', updateFrame);
  }, [showCrop, aspectRatio]);

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

            {/* 实时尺寸显示 */}
            {imageNaturalSize.width > 0 && (
              <div className="flex items-center justify-center gap-4 mb-3 px-4 py-2 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-sm text-gray-600">
                  {t('输出尺寸', 'Output size')}: 
                  <span className="font-mono font-semibold text-purple-600 ml-1">
                    {Math.round(outputSize.width)} × {Math.round(outputSize.height)}
                  </span>
                  px
                </span>
                {(minWidth || minHeight) && (
                  <span className="text-xs text-gray-400">
                    ({t('最小', 'Min')}: {minWidth || '—'} × {minHeight || '—'}px)
                  </span>
                )}
              </div>
            )}

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
                min={minScale}
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

