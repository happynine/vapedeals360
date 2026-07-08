'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Modal, Grid, Slider, Button } from '@arco-design/web-react';
import { IconMinus, IconPlus } from '@arco-design/web-react/icon';

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageCropModalProps {
  visible: boolean;
  imageSrc: string;
  targetImageElement?: HTMLImageElement | null;
  onCancel: () => void;
  onConfirm: (croppedDataUrl: string, dimensions: { width: number; height: number }) => void;
  title?: string;
  aspect?: number;
}

/* ── 根据 scale/pan 计算裁剪区域并在 canvas 上输出 ── */
async function getCroppedImg(
  imageSrc: string,
  scale: number,
  panX: number,
  panY: number,
  cropFrameW: number,
  cropFrameH: number,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', (e) => reject(e));
    img.src = imageSrc;
  });

  const dispW = image.width;
  const dispH = image.height;
  const ratio = image.naturalWidth / dispW;

  const imgCenterX = dispW / 2;
  const imgCenterY = dispH / 2;
  const cropCenterImgX = imgCenterX - panX / scale;
  const cropCenterImgY = imgCenterY - panY / scale;

  const cropW = cropFrameW / scale;
  const cropH = cropFrameH / scale;

  const sx = cropCenterImgX - cropW / 2;
  const sy = cropCenterImgY - cropH / 2;

  const outW = Math.round(cropW * ratio);
  const outH = Math.round(cropH * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(image, sx, sy, cropW, cropH, 0, 0, outW, outH);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  return { dataUrl, width: outW, height: outH };
}

/* ── 裁剪器内容 ── */
function CropperContent({
  imageSrc,
  aspect,
  onConfirm,
  onCancel,
  uploading,
  lang,
}: {
  imageSrc: string;
  aspect: number;
  onConfirm: (dataUrl: string, dims: { width: number; height: number }) => void;
  onCancel: () => void;
  uploading: boolean;
  lang: string;
}) {
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cropFrame, setCropFrame] = useState({ width: 300, height: 300 });

  /* 计算裁剪框尺寸（相对于容器） */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const { clientWidth: cw, clientHeight: ch } = el;
    const pad = 40;
    const maxW = cw - pad;
    const maxH = ch - pad;
    let w: number, h: number;
    if (maxW / maxH > aspect) {
      h = maxH;
      w = h * aspect;
    } else {
      w = maxW;
      h = w / aspect;
    }
    setCropFrame({ width: Math.round(w), height: Math.round(h) });
  }, [aspect]);

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
  const zoomOut = useCallback(() => setScale((s) => Math.max(0.5, +(s - 0.1).toFixed(1))), []);
  const zoomIn = useCallback(() => setScale((s) => Math.min(3, +(s + 0.1).toFixed(1))), []);

  /* ── 确认裁剪 ── */
  const handleOk = useCallback(async () => {
    if (!imgRef.current) return;
    const result = await getCroppedImg(imageSrc, scale, panX, panY, cropFrame.width, cropFrame.height);
    if (result) onConfirm(result.dataUrl, { width: result.width, height: result.height });
  }, [imageSrc, scale, panX, panY, cropFrame, onConfirm]);

  const t = (zh: string, en: string) => (lang === 'zh' ? zh : en);

  return (
    <>
      {/* 图片区域 */}
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: 350,
          position: 'relative',
          background: '#1a1a1a',
          borderRadius: 8,
          overflow: 'hidden',
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
          src={imageSrc}
          alt="crop"
          draggable={false}
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
      <Grid.Row justify="center" style={{ marginTop: 20, marginBottom: 20 }}>
        <IconMinus
          style={{ marginRight: 10, cursor: 'pointer', color: '#7c3aed', fontSize: 18 }}
          onClick={zoomOut}
        />
        <Slider
          style={{ width: 200 }}
          step={0.1}
          value={scale}
          min={0.5}
          max={3}
          onChange={(v) => setScale(v as number)}
        />
        <IconPlus
          style={{ marginLeft: 10, cursor: 'pointer', color: '#7c3aed', fontSize: 18 }}
          onClick={zoomIn}
        />
        <span style={{ marginLeft: 12, fontSize: 13, color: '#888', minWidth: 40, textAlign: 'center' }}>
          {Math.round(scale * 100)}%
        </span>
      </Grid.Row>

      {/* 按钮 */}
      <Grid.Row justify="end">
        <Button onClick={onCancel} style={{ marginRight: 20 }}>
          {t('取消', 'Cancel')}
        </Button>
        <Button type="primary" loading={uploading} onClick={handleOk}>
          {t('确定', 'OK')}
        </Button>
      </Grid.Row>
    </>
  );
}

/* ── 主组件 ── */
export default function ImageCropModal({
  visible,
  imageSrc,
  targetImageElement,
  onCancel,
  onConfirm,
  title = '裁剪图片',
  aspect = 1,
}: ImageCropModalProps) {
  const [modalRef, setModalRef] = useState<ReturnType<typeof Modal.confirm> | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (visible && imageSrc) {
      const modal = Modal.confirm({
        title,
        simple: false,
        style: { width: 560 },
        footer: null,
        content: (
          <CropperContent
            imageSrc={imageSrc}
            aspect={aspect}
            uploading={uploading}
            lang="zh"
            onConfirm={(dataUrl, dims) => {
              onConfirm(dataUrl, dims);
              modal.close();
              setModalRef(null);
              setUploading(false);
            }}
            onCancel={() => {
              modal.close();
              setModalRef(null);
              onCancel();
            }}
          />
        ),
      });
      setModalRef(modal);
    } else if (!visible && modalRef) {
      modalRef.close();
      setModalRef(null);
    }
  }, [visible, imageSrc]);

  useEffect(() => {
    return () => {
      if (modalRef) modalRef.close();
    };
  }, [modalRef]);

  return null;
}