'use client';

import { useState, useRef, useCallback } from 'react';
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

  const onSelectFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setSrc(reader.result as string);
      setShowCrop(true);
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
  }, []);

  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">
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
            <div className="flex justify-center mb-4">
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
                />
              </ReactCrop>
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
