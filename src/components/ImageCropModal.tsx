'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { Modal, Button, Slider } from '@arco-design/web-react';
import { IconMinus, IconPlus } from '@arco-design/web-react/icon';

interface ImageCropModalProps {
  visible: boolean;
  imageSrc: string;
  targetImageElement?: HTMLImageElement | null;
  onCancel: () => void;
  onConfirm: (croppedDataUrl: string, dimensions: { width: number; height: number }) => void;
  title?: string;
  aspect?: number;
  minWidth?: number;
  minHeight?: number;
}

/* Create an offscreen canvas crop from the given image + pixel crop area */
const createCropImage = (
  imageSrc: string,
  pixelCrop: Area,
): Promise<{ dataUrl: string; width: number; height: number }> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.addEventListener('load', () => {
      const canvas = document.createElement('canvas');
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('No 2d context'));
        return;
      }
      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height,
      );
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', 0.92),
        width: pixelCrop.width,
        height: pixelCrop.height,
      });
    });
    image.addEventListener('error', reject);
    image.src = imageSrc;
  });

export default function ImageCropModal({
  visible,
  imageSrc,
  onCancel,
  onConfirm,
  title = 'Crop Image',
  aspect = 1,
  minWidth,
  minHeight,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset state whenever a new image opens
  useEffect(() => {
    if (visible) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setSubmitting(false);
    }
  }, [visible, imageSrc]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  // Compute projected output size based on the live crop area (in displayed px)
  // and natural image size. react-easy-crop gives pixel values that map to the
  // source image when the image fills the media area, but when zoomed < 1 the
  // source mapping still works because the library scales with natural size.
  const outputSize = React.useMemo(() => {
    if (!croppedAreaPixels) return { width: 0, height: 0 };
    return {
      width: Math.round(croppedAreaPixels.width),
      height: Math.round(croppedAreaPixels.height),
    };
  }, [croppedAreaPixels]);

  const isSizeValid = React.useMemo(() => {
    if (!minWidth && !minHeight) return true;
    const wValid = !minWidth || outputSize.width >= minWidth;
    const hValid = !minHeight || outputSize.height >= minHeight;
    return wValid && hValid;
  }, [outputSize, minWidth, minHeight]);

  const handleOk = useCallback(async () => {
    if (!croppedAreaPixels) return;
    setSubmitting(true);
    try {
      const result = await createCropImage(imageSrc, croppedAreaPixels);
      onConfirm(result.dataUrl, { width: result.width, height: result.height });
    } catch (err) {
      console.error('Crop failed:', err);
      setSubmitting(false);
    }
  }, [croppedAreaPixels, imageSrc, onConfirm]);

  const zoomOut = useCallback(() => setZoom((z) => Math.max(1, +(z - 0.05).toFixed(2))), []);
  const zoomIn = useCallback(() => setZoom((z) => Math.min(3, +(z + 0.05).toFixed(2))), []);

  return (
    <Modal
      visible={visible}
      title={
        minWidth && minHeight ? `${title} (${minWidth}×${minHeight}px)` : title
      }
      onCancel={onCancel}
      style={{ width: 600 }}
      maskClosable={false}
      escToExit={!submitting}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button type="primary" loading={submitting} onClick={handleOk} disabled={!isSizeValid}>
            OK
          </Button>
        </div>
      }
    >
      {/* Cropper viewport */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 360,
          background: '#1a1a1a',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={aspect}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          objectFit="contain"
        />
      </div>

      {/* Zoom slider */}
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 16, padding: '0 8px' }}>
        <IconMinus
          style={{ cursor: 'pointer', color: '#7c3aed', fontSize: 18, marginRight: 10 }}
          onClick={zoomOut}
        />
        <Slider
          style={{ flex: 1 }}
          step={0.01}
          value={zoom}
          min={1}
          max={3}
          onChange={(v) => setZoom(v as number)}
        />
        <IconPlus
          style={{ cursor: 'pointer', color: '#7c3aed', fontSize: 18, marginLeft: 10 }}
          onClick={zoomIn}
        />
        <span style={{ marginLeft: 12, fontSize: 13, color: '#888', minWidth: 44, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* Output size indicator */}
      <div
        style={{
          marginTop: 12,
          padding: '6px 12px',
          background: isSizeValid ? '#f0fdf4' : '#fef2f2',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: isSizeValid ? '#166534' : '#991b1b',
          border: `1px solid ${isSizeValid ? '#bbf7d0' : '#fecaca'}`,
        }}
      >
        <span style={{ fontWeight: 500 }}>Output:</span>
        <span
          style={{
            color: isSizeValid ? '#7c3aed' : '#dc2626',
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {outputSize.width} × {outputSize.height} px
        </span>
        {(minWidth || minHeight) && (
          <span style={{ color: isSizeValid ? '#9ca3af' : '#dc2626', fontSize: 12 }}>
            (min {minWidth || '∞'} × {minHeight || '∞'})
          </span>
        )}
        {!isSizeValid && (
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500 }}>
            ⚠️ Too small, zoom in
          </span>
        )}
      </div>
    </Modal>
  );
}
