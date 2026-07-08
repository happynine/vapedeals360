'use client';

import React, { useState, useCallback, useEffect } from 'react';
import Cropper from 'react-easy-crop';
import { Modal, Grid, Slider, Button, Message } from '@arco-design/web-react';
import { IconMinus, IconPlus, IconRotateLeft } from '@arco-design/web-react/icon';

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
  aspect?: number; // 裁剪比例，默认 1:1
}

// 获取裁剪后的图片 Data URL 和尺寸
async function getCroppedImg(
  imageSrc: string,
  pixelCrop: CropArea,
  rotation: number = 0
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.addEventListener('load', () => resolve(img));
    img.addEventListener('error', (error) => reject(error));
    img.src = imageSrc;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx || !image) {
    return null;
  }

  const imageSize = 2 * ((Math.max(image.width, image.height) / 2) * Math.sqrt(2));
  canvas.width = imageSize;
  canvas.height = imageSize;

  if (rotation) {
    ctx.translate(imageSize / 2, imageSize / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-imageSize / 2, -imageSize / 2);
  }

  ctx.drawImage(image, imageSize / 2 - image.width / 2, imageSize / 2 - image.height / 2);
  const data = ctx.getImageData(0, 0, imageSize, imageSize);

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;
  ctx.putImageData(
    data,
    Math.round(0 - imageSize / 2 + image.width * 0.5 - pixelCrop.x),
    Math.round(0 - imageSize / 2 + image.height * 0.5 - pixelCrop.y)
  );

  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  return {
    dataUrl,
    width: pixelCrop.width,
    height: pixelCrop.height,
  };
}

// 内部裁剪器组件
interface CropperContentProps {
  imageSrc: string;
  aspect: number;
  onCropComplete: (croppedAreaPixels: CropArea) => void;
  onOk: () => void;
  onCancel: () => void;
}

function CropperContent({ imageSrc, aspect, onCropComplete, onOk, onCancel }: CropperContentProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);

  const handleCropComplete = useCallback((_: CropArea, croppedPixels: CropArea) => {
    setCroppedAreaPixels(croppedPixels);
    onCropComplete(croppedPixels);
  }, [onCropComplete]);

  return (
    <>
      <div style={{ width: '100%', height: 280, position: 'relative', background: '#1a1a1a' }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          rotation={rotation}
          aspect={aspect}
          onCropChange={setCrop}
          onCropComplete={handleCropComplete}
          onZoomChange={setZoom}
          onRotationChange={setRotation}
          style={{
            containerStyle: {
              width: '100%',
              height: 280,
              background: '#1a1a1a',
            },
            cropAreaStyle: {
              border: '2px solid #7c3aed',
            },
          }}
        />
      </div>

      {/* 缩放和旋转控制 */}
      <Grid.Row justify="space-between" style={{ marginTop: 20, marginBottom: 20 }}>
        {/* 缩放控制 */}
        <Grid.Row style={{ flex: 1, marginLeft: 12, marginRight: 12 }}>
          <IconMinus
            style={{ marginRight: 10, cursor: 'pointer', color: '#7c3aed' }}
            onClick={() => setZoom(Math.max(0.8, zoom - 0.1))}
          />
          <Slider
            style={{ flex: 1 }}
            step={0.1}
            value={zoom}
            onChange={(v) => setZoom(v as number)}
            min={0.8}
            max={3}
          />
          <IconPlus
            style={{ marginLeft: 10, cursor: 'pointer', color: '#7c3aed' }}
            onClick={() => setZoom(Math.min(3, zoom + 0.1))}
          />
        </Grid.Row>

        {/* 旋转控制 */}
        <IconRotateLeft
          style={{ cursor: 'pointer', color: '#7c3aed' }}
          onClick={() => setRotation(rotation - 90)}
        />
      </Grid.Row>

      {/* 确定和取消按钮 */}
      <Grid.Row justify="end">
        <Button onClick={onCancel} style={{ marginRight: 20 }}>
          取消
        </Button>
        <Button type="primary" onClick={onOk}>
          确定
        </Button>
      </Grid.Row>
    </>
  );
}

export default function ImageCropModal({
  visible,
  imageSrc,
  targetImageElement,
  onCancel,
  onConfirm,
  title = '裁剪图片',
  aspect = 1,
}: ImageCropModalProps) {
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<CropArea | null>(null);
  const [modalRef, setModalRef] = useState<ReturnType<typeof Modal.confirm> | null>(null);

  // 当 visible 变化时，打开或关闭 Modal
  useEffect(() => {
    if (visible && imageSrc) {
      const modal = Modal.confirm({
        title: title,
        simple: false,
        style: { width: 500 },
        footer: null,
        content: (
          <CropperContent
            imageSrc={imageSrc}
            aspect={aspect}
            onCropComplete={(pixels) => setCroppedAreaPixels(pixels)}
            onOk={async () => {
              if (!imageSrc || !croppedAreaPixels) {
                Message.error('裁剪区域无效');
                return;
              }
              try {
                const result = await getCroppedImg(imageSrc, croppedAreaPixels, 0);
                if (result) {
                  onConfirm(result.dataUrl, { width: result.width, height: result.height });
                  Message.success('裁剪成功');
                } else {
                  Message.error('裁剪失败');
                }
              } catch (error) {
                console.error('裁剪错误:', error);
                Message.error('裁剪失败');
              }
              modal.close();
            }}
            onCancel={() => {
              Message.info('取消裁剪');
              modal.close();
            }}
          />
        ),
        onCancel: () => {
          Message.info('取消裁剪');
          onCancel();
        },
      });
      setModalRef(modal);
    } else if (!visible && modalRef) {
      modalRef.close();
      setModalRef(null);
    }
  }, [visible, imageSrc]);

  // 清理：当组件卸载时关闭 Modal
  useEffect(() => {
    return () => {
      if (modalRef) {
        modalRef.close();
      }
    };
  }, [modalRef]);

  return null; // 这个组件不渲染任何内容，Modal.confirm 会自动渲染
}