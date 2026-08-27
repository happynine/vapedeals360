'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { Modal, Button, Slider } from 'antd';

const MinusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

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

/* ── 根据宽高比计算 Modal 宽度和裁剪区域高度 ── */
const getModalDimensions = (aspect: number) => {
  if (aspect >= 3.5) return { width: 880, height: 220 };
  if (aspect >= 2.5) return { width: 760, height: 260 };
  if (aspect >= 1.4) return { width: 720, height: 360 };
  if (aspect >= 0.8) return { width: 560, height: 440 };
  return { width: 560, height: 520 };
};

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
  const [mediaSize, setMediaSize] = useState<{ w: number; h: number } | null>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const dims = useMemo(() => getModalDimensions(aspect), [aspect]);

  // Measure container after render
  useEffect(() => {
    if (visible && containerRef.current) {
      const el = containerRef.current;
      setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    }
  }, [visible, dims.height]);

  // Reset state whenever a new image opens
  useEffect(() => {
    if (visible) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setSubmitting(false);
      setMediaSize(null);
    }
  }, [visible, imageSrc]);

  // Auto-fit: compute cover zoom when media loads and container is measured
  useEffect(() => {
    if (!mediaSize || !containerSize) return;
    // The crop box dimensions within the container (constrained by aspect)
    const containerAspect = containerSize.w / containerSize.h;
    let cropW: number, cropH: number;
    if (aspect > containerAspect) {
      cropW = containerSize.w;
      cropH = cropW / aspect;
    } else {
      cropH = containerSize.h;
      cropW = cropH * aspect;
    }
    // At zoom=1 with objectFit=contain, image fits within cropW×cropH
    const imgAspect = mediaSize.w / mediaSize.h;
    let containedW: number, containedH: number;
    if (imgAspect > aspect) {
      containedH = cropH;
      containedW = containedH * imgAspect;
    } else {
      containedW = cropW;
      containedH = containedW / imgAspect;
    }
    // Zoom needed to cover the crop area
    const coverZoom = Math.max(cropW / containedW, cropH / containedH);
    setZoom(Math.min(Math.max(coverZoom, 0.3), 5));
  }, [mediaSize, containerSize, aspect]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const onMediaLoaded = useCallback((media: { naturalWidth: number; naturalHeight: number }) => {
    setMediaSize({ w: media.naturalWidth, h: media.naturalHeight });
  }, []);

  const outputSize = useMemo(() => {
    if (!croppedAreaPixels) return { width: 0, height: 0 };
    return {
      width: Math.round(croppedAreaPixels.width),
      height: Math.round(croppedAreaPixels.height),
    };
  }, [croppedAreaPixels]);

  const isSizeValid = useMemo(() => {
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

  const zoomOut = useCallback(
    () => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2))),
    [],
  );
  const zoomIn = useCallback(
    () => setZoom((z) => Math.min(5, +(z + 0.1).toFixed(2))),
    [],
  );

  // Re-fit button
  const reFit = useCallback(() => {
    setCrop({ x: 0, y: 0 });
    if (mediaSize && containerSize) {
      const containerAspect = containerSize.w / containerSize.h;
      let cropW: number, cropH: number;
      if (aspect > containerAspect) {
        cropW = containerSize.w;
        cropH = cropW / aspect;
      } else {
        cropH = containerSize.h;
        cropW = cropH * aspect;
      }
      const imgAspect = mediaSize.w / mediaSize.h;
      let containedW: number, containedH: number;
      if (imgAspect > aspect) {
        containedH = cropH;
        containedW = containedH * imgAspect;
      } else {
        containedW = cropW;
        containedH = containedW / imgAspect;
      }
      const coverZoom = Math.max(cropW / containedW, cropH / containedH);
      setZoom(Math.min(Math.max(coverZoom, 0.3), 5));
    }
  }, [mediaSize, containerSize, aspect]);

  return (
    <Modal
      open={visible}
      title={minWidth && minHeight ? `${title} (${minWidth}×${minHeight}px)` : title}
      onCancel={onCancel}
      width={dims.width}
      maskClosable={false}
      keyboard={!submitting}
      footer={[
        <Button key="cancel" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>,
        <Button
          key="ok"
          type="primary"
          loading={submitting}
          onClick={handleOk}
          disabled={!isSizeValid}
        >
          OK
        </Button>,
      ]}
    >
      {/* Cropper viewport */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          width: '100%',
          height: dims.height,
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
          onMediaLoaded={onMediaLoaded}
          objectFit="contain"
        />
      </div>

      {/* Zoom slider */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginTop: 16,
          padding: '0 4px',
        }}
      >
        <Button
          type="text"
          icon={<MinusIcon />}
          onClick={zoomOut}
          style={{ color: '#7c3aed' }}
        />
        <Slider
          style={{ flex: 1, margin: '0 12px' }}
          step={0.01}
          value={zoom}
          min={0.3}
          max={5}
          onChange={(v) => setZoom(v as number)}
        />
        <Button
          type="text"
          icon={<PlusIcon />}
          onClick={zoomIn}
          style={{ color: '#7c3aed' }}
        />
        <span
          style={{
            marginLeft: 8,
            fontSize: 13,
            color: '#888',
            minWidth: 44,
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {Math.round(zoom * 100)}%
        </span>
        <Button
          type="text"
          size="small"
          onClick={reFit}
          style={{ color: '#7c3aed', fontSize: 12, marginLeft: 4 }}
        >
          Fit
        </Button>
      </div>

      {/* Output size indicator */}
      <div
        style={{
          marginTop: 8,
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
