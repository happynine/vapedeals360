'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Modal, Slider, Button, Space, InputNumber } from '@arco-design/web-react';
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import '@arco-design/web-react/dist/css/arco.css';

interface ImageCropModalProps {
  visible: boolean;
  imageSrc: string;
  onCancel: () => void;
  onConfirm: (croppedImageData: string, cropDimensions: { width: number; height: number }) => void;
  defaultWidth?: number;
  defaultHeight?: number;
  aspectRatio?: number;
  title?: string;
}

// Helper function to create a centered crop
function createCenteredCrop(
  imageWidth: number,
  imageHeight: number,
  cropWidth: number,
  cropHeight: number
): Crop {
  const scaleX = cropWidth / imageWidth;
  const scaleY = cropHeight / imageHeight;
  
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: Math.min(scaleX * 100, 100),
        height: Math.min(scaleY * 100, 100),
      },
      cropWidth / cropHeight,
      imageWidth,
      imageHeight
    ),
    imageWidth,
    imageHeight
  );
}

export function ImageCropModal({
  visible,
  imageSrc,
  onCancel,
  onConfirm,
  defaultWidth = 400,
  defaultHeight = 400,
  aspectRatio,
  title = '裁剪图片',
}: ImageCropModalProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [scale, setScale] = useState(100);
  const [cropWidth, setCropWidth] = useState(defaultWidth);
  const [cropHeight, setCropHeight] = useState(defaultHeight);
  const imgRef = useRef<HTMLImageElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [imgDimensions, setImgDimensions] = useState({ width: 0, height: 0 });

  // Initialize crop when image loads
  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const { naturalWidth, naturalHeight } = img;
    setImgDimensions({ width: naturalWidth, height: naturalHeight });
    
    // Create initial centered crop
    const initialCrop = createCenteredCrop(naturalWidth, naturalHeight, cropWidth, cropHeight);
    setCrop(initialCrop);
  }, [cropWidth, cropHeight]);

  // Update crop when dimensions change
  useEffect(() => {
    if (imgDimensions.width && imgDimensions.height && crop) {
      const newCrop = createCenteredCrop(imgDimensions.width, imgDimensions.height, cropWidth, cropHeight);
      setCrop(newCrop);
    }
  }, [cropWidth, cropHeight]);

  // Generate cropped image
  const getCroppedImage = useCallback(async (): Promise<string> => {
    const image = imgRef.current;
    const canvas = previewCanvasRef.current;
    if (!image || !canvas || !completedCrop) {
      return '';
    }

    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    const cropX = completedCrop.x * scaleX;
    const cropY = completedCrop.y * scaleY;
    const cropW = completedCrop.width * scaleX;
    const cropH = completedCrop.height * scaleY;

    // Calculate the actual crop dimensions respecting aspect ratio
    const actualWidth = Math.min(cropW, image.naturalWidth - cropX);
    const actualHeight = aspectRatio ? actualWidth / aspectRatio : Math.min(cropH, image.naturalHeight - cropY);

    canvas.width = cropWidth;
    canvas.height = cropHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.drawImage(
      image,
      cropX,
      cropY,
      actualWidth,
      actualHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );

    // Return as data URL (PNG)
    return canvas.toDataURL('image/png', 0.9);
  }, [completedCrop, cropWidth, cropHeight, aspectRatio]);

  const handleConfirm = async () => {
    const croppedData = await getCroppedImage();
    if (croppedData) {
      onConfirm(croppedData, { width: cropWidth, height: cropHeight });
    }
  };

  return (
    <Modal
      visible={visible}
      title={title}
      onCancel={onCancel}
      footer={null}
      style={{ width: 800, maxWidth: '90vw' }}
      autoFocus={false}
      focusLock={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Crop dimensions input */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontWeight: 500 }}>裁剪尺寸:</span>
          <Space>
            <InputNumber
              value={cropWidth}
              onChange={(val) => setCropWidth(val || defaultWidth)}
              min={50}
              max={2000}
              style={{ width: 100 }}
              suffix="px"
            />
            <span>×</span>
            <InputNumber
              value={cropHeight}
              onChange={(val) => setCropHeight(val || defaultHeight)}
              min={50}
              max={2000}
              style={{ width: 100 }}
              suffix="px"
            />
          </Space>
        </div>

        {/* Scale control */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontWeight: 500 }}>缩放:</span>
          <Slider
            value={scale}
            onChange={(val) => setScale(val as number)}
            min={50}
            max={200}
            style={{ width: 200 }}
            showInput
          />
          <span>{scale}%</span>
        </div>

        {/* Crop area */}
        <div 
          style={{ 
            position: 'relative',
            width: '100%',
            height: 400,
            overflow: 'hidden',
            background: '#f2f3f5',
            borderRadius: 8,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <div style={{ transform: `scale(${scale / 100})`, transformOrigin: 'center' }}>
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={aspectRatio || cropWidth / cropHeight}
              minWidth={cropWidth * 0.1}
              minHeight={cropHeight * 0.1}
            >
              <img
                ref={imgRef}
                src={imageSrc}
                onLoad={onImageLoad}
                style={{ maxWidth: '100%', maxHeight: 400 }}
                alt="Crop preview"
              />
            </ReactCrop>
          </div>
        </div>

        {/* Dimension info */}
        <div style={{ display: 'flex', gap: 16, color: '#86909c' }}>
          <span>原图尺寸: {imgDimensions.width} × {imgDimensions.height} px</span>
          <span>|</span>
          <span>裁剪输出: {cropWidth} × {cropHeight} px</span>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={handleConfirm}>
            确认裁剪
          </Button>
        </div>
      </div>

      {/* Hidden canvas for processing */}
      <canvas ref={previewCanvasRef} style={{ display: 'none' }} />
    </Modal>
  );
}

export default ImageCropModal;