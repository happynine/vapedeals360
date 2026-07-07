'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface ImageUploadProps {
  value: string | null; // image_key from S3
  onUploadComplete?: (key: string) => void;
  onChange?: (key: string | null) => void; // alias for onUploadComplete
  aspectRatio?: number; // locked aspect ratio, e.g. 21/6 for banner
  suggestedSize?: string; // e.g. "1200x400px"
  recommendedSize?: string; // alias for suggestedSize
  label?: string;
  folder?: string; // upload folder in S3
  lang?: string; // language for UI text
}

export function ImageUpload({
  value,
  onUploadComplete,
  onChange,
  aspectRatio,
  suggestedSize,
  recommendedSize,
  label = 'Image',
  folder = 'uploads',
  lang = 'en',
}: ImageUploadProps) {
  const sizeHint = suggestedSize || recommendedSize;
  const handleComplete = onChange || onUploadComplete || (() => {});
  const [showCrop, setShowCrop] = useState(false);
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [uploading, setUploading] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // Zoom and pan states
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0, panX: 0, panY: 0 });

  // Real-time crop dimensions in pixels (from original image)
  const [cropDimensions, setCropDimensions] = useState({ width: 0, height: 0 });

  const onSelectFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSrc(reader.result as string);
      setShowCrop(true);
      // Reset zoom and pan
      setScale(1);
      setPanX(0);
      setPanY(0);
      // Initialize crop to cover full image with the aspect ratio
      if (aspectRatio) {
        setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
      } else {
        setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
      }
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, [aspectRatio]);

  // Calculate real crop dimensions based on original image size and current crop
  const updateCropDimensions = useCallback(() => {
    if (!imgRef.current || !crop) return;
    const img = imgRef.current;
    const scaleX = img.naturalWidth / img.width;
    const scaleY = img.naturalHeight / img.height;
    
    let pixelCrop: PixelCrop;
    if (crop.unit === '%') {
      pixelCrop = {
        unit: 'px',
        x: Math.round((crop.x || 0) * img.width / 100 * scaleX),
        y: Math.round((crop.y || 0) * img.height / 100 * scaleY),
        width: Math.round((crop.width || 100) * img.width / 100 * scaleX),
        height: Math.round((crop.height || 100) * img.height / 100 * scaleY),
      };
    } else {
      pixelCrop = {
        unit: 'px',
        x: Math.round((crop.x || 0) * scaleX),
        y: Math.round((crop.y || 0) * scaleY),
        width: Math.round((crop.width || 100) * scaleX),
        height: Math.round((crop.height || 100) * scaleY),
      };
    }
    
    setCropDimensions({ width: pixelCrop.width, height: pixelCrop.height });
    setCompletedCrop(pixelCrop);
  }, [crop]);

  // Update dimensions when crop changes
  useEffect(() => {
    updateCropDimensions();
  }, [updateCropDimensions]);

  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      imgRef.current = e.currentTarget;
      const { width, height } = e.currentTarget;
      if (aspectRatio) {
        const imgAspect = width / height;
        const targetAspect = aspectRatio;
        let cropW: number, cropH: number, cropX: number, cropY: number;
        if (imgAspect > targetAspect) {
          cropH = 100;
          cropW = (targetAspect / imgAspect) * 100;
          cropX = (100 - cropW) / 2;
          cropY = 0;
        } else {
          cropW = 100;
          cropH = (imgAspect / targetAspect) * 100;
          cropX = 0;
          cropY = (100 - cropH) / 2;
        }
        const initialCrop: Crop = {
          unit: '%',
          width: cropW,
          height: cropH,
          x: cropX,
          y: cropY,
        };
        setCrop(initialCrop);
        // Initialize completedCrop with actual pixel dimensions
        const scaleX = e.currentTarget.naturalWidth / width;
        const scaleY = e.currentTarget.naturalHeight / height;
        setCompletedCrop({
          unit: 'px',
          width: Math.round(cropW * width / 100 * scaleX),
          height: Math.round(cropH * height / 100 * scaleY),
          x: Math.round(cropX * width / 100 * scaleX),
          y: Math.round(cropY * height / 100 * scaleY),
        });
      } else {
        // No aspect ratio: initialize completedCrop to full image
        setCompletedCrop({
          unit: 'px',
          width: e.currentTarget.naturalWidth,
          height: e.currentTarget.naturalHeight,
          x: 0,
          y: 0,
        });
      }
    },
    [aspectRatio]
  );

  const handleCropAndUpload = useCallback(async () => {
    if (!completedCrop || !imgRef.current) return;
    const image = imgRef.current;

    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const cropX = completedCrop.x * scaleX;
    const cropY = completedCrop.y * scaleY;
    const cropWidth = completedCrop.width * scaleX;
    const cropHeight = completedCrop.height * scaleY;

    canvas.width = cropWidth;
    canvas.height = cropHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(image, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    setUploading(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9)
      );
      if (!blob) throw new Error('Failed to create image');

      const file = new File([blob], `crop-${Date.now()}.jpg`, { type: 'image/jpeg' });
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
  }, [completedCrop, folder, handleComplete]);

  const handleCancelCrop = useCallback(() => {
    setShowCrop(false);
    setSrc(null);
    setScale(1);
    setPanX(0);
    setPanY(0);
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start pan if clicking on the container (not on crop area)
    if ((e.target as HTMLElement).closest('.ReactCrop')) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX, y: e.clientY, panX, panY });
  }, [panX, panY]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    const dx = e.clientX - panStart.x;
    const dy = e.clientY - panStart.y;
    setPanX(panStart.panX + dx);
    setPanY(panStart.panY + dy);
  }, [isPanning, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(3, s + 0.1));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(0.5, s - 0.1));
  }, []);

  const handleZoomSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setScale(parseFloat(e.target.value));
  }, []);

  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1 text-left">
        {label}
        {sizeHint && (
          <span className="text-[10px] text-muted-foreground/60 ml-1">({sizeHint})</span>
        )}
      </label>

      {/* Preview current image */}
      {value && !showCrop && (
        <div className="mb-2 relative group">
          <img
            src={value.startsWith('http') ? value : `/api/image?key=${encodeURIComponent(value)}`}
            alt="Preview"
            className="rounded-lg border border-border max-h-32 object-cover"
          />
        </div>
      )}

      {/* Upload button */}
      {!showCrop && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="rounded-lg border border-dashed border-border bg-secondary/50 px-4 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
          >
            {uploading ? (lang === 'zh' ? '上传中...' : 'Uploading...') : value ? (lang === 'zh' ? '替换图片' : 'Replace Image') : (lang === 'zh' ? '选择图片' : 'Select Image')}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => handleComplete('')}
              className="text-xs text-destructive hover:underline"
            >
              {lang === 'zh' ? '移除' : 'Remove'}
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={onSelectFile}
            className="hidden"
          />
        </div>
      )}

      {/* Crop Modal */}
      {showCrop && src && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-3xl rounded-2xl border border-border bg-card p-4 max-h-[90vh] overflow-auto">
            <h3 className="text-sm font-semibold mb-3">{lang === 'zh' ? '裁剪图片' : 'Crop Image'}</h3>
            
            {/* Crop dimension display */}
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-red-500 px-2 py-1 text-xs font-semibold text-white">
                {cropDimensions.width}×{cropDimensions.height}px
              </span>
              {sizeHint && (
                <span className="text-xs text-muted-foreground">
                  {lang === 'zh' ? '建议尺寸:' : 'Recommended:'} {sizeHint}
                </span>
              )}
            </div>
            
            {/* Crop container with zoom/pan */}
            <div 
              ref={containerRef}
              className="flex justify-center mb-4 overflow-hidden relative bg-gray-100 rounded-lg"
              style={{ minHeight: '300px', cursor: isPanning ? 'grabbing' : 'grab' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <div 
                style={{ 
                  transform: `scale(${scale}) translate(${panX / scale}px, ${panY / scale}px)`,
                  transformOrigin: 'center center',
                  transition: isPanning ? 'none' : 'transform 0.1s ease-out'
                }}
              >
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  onComplete={(c) => setCompletedCrop(c)}
                  aspect={aspectRatio}
                >
                  <img
                    src={src}
                    alt="Crop"
                    onLoad={onImageLoad}
                    className="max-h-[60vh] max-w-full"
                    style={{ pointerEvents: 'none' }}
                  />
                </ReactCrop>
              </div>
            </div>
            
            {/* Zoom controls */}
            <div className="flex items-center justify-center gap-3 mb-4 bg-white rounded-lg py-2 px-4 shadow-sm">
              <button
                type="button"
                onClick={handleZoomOut}
                className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-lg font-bold text-gray-700 transition-colors"
              >
                −
              </button>
              <input
                type="range"
                min="0.5"
                max="3"
                step="0.1"
                value={scale}
                onChange={handleZoomSlider}
                className="w-24 h-2 cursor-pointer accent-purple-600"
              />
              <button
                type="button"
                onClick={handleZoomIn}
                className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-gray-200 text-lg font-bold text-gray-700 transition-colors"
              >
                +
              </button>
              <span className="text-sm text-gray-500 min-w-[50px] text-center">
                {Math.round(scale * 100)}%
              </span>
            </div>
            
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleCancelCrop}
                className="rounded-lg border border-border px-4 py-2 text-sm"
              >
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button
                type="button"
                onClick={handleCropAndUpload}
                disabled={uploading}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {uploading ? (lang === 'zh' ? '上传中...' : 'Uploading...') : (lang === 'zh' ? '裁剪并上传' : 'Crop & Upload')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}