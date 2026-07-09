'use client';

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
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
  minWidth?: number;
  minHeight?: number;
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
  minWidth,
  minHeight,
}: {
  imageSrc: string;
  aspect: number;
  onConfirm: (dataUrl: string, dims: { width: number; height: number }) => void;
  onCancel: () => void;
  uploading: boolean;
  lang: string;
  minWidth?: number;
  minHeight?: number;
}) {
  const [scale, setScale] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cropFrame, setCropFrame] = useState({ width: 300, height: 300 });
  const [imgNaturalSize, setImgNaturalSize] = useState({ width: 0, height: 0 });
  const [imgDisplaySize, setImgDisplaySize] = useState({ width: 0, height: 0 });

  /* 获取图片自然尺寸和显示尺寸，并自动调整初始缩放 */
  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const handleLoad = () => {
      const natW = img.naturalWidth;
      const natH = img.naturalHeight;
      setImgNaturalSize({ width: natW, height: natH });
      setImgDisplaySize({ width: img.clientWidth, height: img.clientHeight });
      
      // 优化1: 如果图片实际尺寸小于要求尺寸，自动放大到贴合裁图框
      if (minWidth && minHeight && cropFrame.width > 0 && cropFrame.height > 0) {
        // 计算图片在裁图框中需要的缩放比例
        const scaleNeededW = minWidth / natW;
        const scaleNeededH = minHeight / natH;
        const minScaleNeeded = Math.max(scaleNeededW, scaleNeededH);
        // 如果需要的缩放比例大于当前最小缩放，则自动设置
        if (minScaleNeeded > 1) {
          setScale(Math.max(minScaleNeeded, 1));
        }
      }
    };
    if (img.complete) {
      handleLoad();
    } else {
      img.addEventListener('load', handleLoad);
      return () => img.removeEventListener('load', handleLoad);
    }
  }, [imageSrc, minWidth, minHeight, cropFrame]);

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

  // 计算最小缩放比例（确保输出图片不小于指定尺寸）
  const minScale = useMemo(() => {
    if (!minWidth || !minHeight || !imgNaturalSize.width) return 0.5;
    // 计算裁剪框相对于图片自然尺寸的比例
    const ratioX = imgNaturalSize.width / cropFrame.width;
    const ratioY = imgNaturalSize.height / cropFrame.height;
    const ratio = Math.min(ratioX, ratioY);
    // 最小缩放 = 最小输出尺寸 / (裁剪框尺寸 * 比例)
    const scaleX = minWidth / (cropFrame.width * ratio);
    const scaleY = minHeight / (cropFrame.height * ratio);
    return Math.max(Math.max(scaleX, scaleY), 0.1);
  }, [minWidth, minHeight, imgNaturalSize, cropFrame]);

  // 计算当前裁剪框对应的实际输出尺寸
  const outputSize = useMemo(() => {
    if (!imgNaturalSize.width || !imgDisplaySize.width) return { width: 0, height: 0 };
    // 图片自然尺寸与显示尺寸的比例
    const ratio = imgNaturalSize.width / imgDisplaySize.width;
    // 裁剪框在图片上对应的实际像素尺寸（考虑缩放）
    const outputW = Math.round((cropFrame.width / scale) * ratio);
    const outputH = Math.round((cropFrame.height / scale) * ratio);
    return { width: outputW, height: outputH };
  }, [imgNaturalSize, imgDisplaySize, cropFrame, scale]);

  // 检查输出尺寸是否满足最小要求
  const isSizeValid = useMemo(() => {
    if (!minWidth && !minHeight) return true;
    const wValid = !minWidth || outputSize.width >= minWidth;
    const hValid = !minHeight || outputSize.height >= minHeight;
    return wValid && hValid;
  }, [outputSize, minWidth, minHeight]);

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
  // 优化2: 缩放步长从 10% 改为 2%
  const zoomOut = useCallback(() => setScale((s) => Math.max(minScale, +(s - 0.02).toFixed(2))), [minScale]);
  const zoomIn = useCallback(() => setScale((s) => Math.min(3, +(s + 0.02).toFixed(2))), []);

  /* ── 确认裁剪 ── */
  const handleOk = useCallback(async () => {
    if (!imgRef.current) return;
    const result = await getCroppedImg(imageSrc, scale, panX, panY, cropFrame.width, cropFrame.height);
    if (result) onConfirm(result.dataUrl, { width: result.width, height: result.height });
  }, [imageSrc, scale, panX, panY, cropFrame, onConfirm]);

  const t = (zh: string, en: string) => (lang === 'zh' ? zh : en);

  return (
    <>
      {/* 实时尺寸显示 */}
      {(minWidth || minHeight) && (
        <div style={{
          marginBottom: 8,
          padding: '6px 12px',
          background: isSizeValid ? '#f0fdf4' : '#fef2f2',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          color: isSizeValid ? '#166534' : '#991b1b',
          border: `1px solid ${isSizeValid ? '#bbf7d0' : '#fecaca'}`,
        }}>
          <span style={{ fontWeight: 500 }}>输出尺寸:</span>
          <span style={{ 
            color: isSizeValid ? '#7c3aed' : '#dc2626', 
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums'
          }}>
            {outputSize.width} × {outputSize.height} px
          </span>
          {(minWidth || minHeight) && (
            <span style={{ color: isSizeValid ? '#9ca3af' : '#dc2626', fontSize: 12 }}>
              (最小: {minWidth || '∞'} × {minHeight || '∞'})
            </span>
          )}
          {!isSizeValid && (
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 500 }}>
              ⚠️ 尺寸不足，请放大图片
            </span>
          )}
        </div>
      )}
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
        >
          {/* 显示实际输出尺寸 */}
          <div
            style={{
              position: 'absolute',
              bottom: '10px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.8)',
              color: '#fff',
              padding: '6px 16px',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              zIndex: 10,
            }}
          >
            输出尺寸: {outputSize.width} × {outputSize.height} px
          </div>
        </div>

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
          step={0.02}
          value={scale}
          min={minScale}
          max={3}
          marks={{
            [minScale]: `${Math.round(minScale * 100)}%`,
            1: '100%',
            2: '200%',
            3: '300%',
          }}
          onChange={(v) => {
            // 优化2: 缩放步长从 10% 改为 2%，四舍五入到最近的 2% 倍数
            const step = 0.02;
            const rounded = Math.round((v as number) / step) * step;
            setScale(Math.max(minScale, Math.min(3, +rounded.toFixed(2))));
          }}
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
        <Button 
          type="primary" 
          loading={uploading} 
          onClick={handleOk}
          disabled={!isSizeValid}
        >
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
  minWidth,
  minHeight,
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