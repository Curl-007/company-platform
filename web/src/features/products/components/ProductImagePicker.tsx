import type { ClipboardEvent, DragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PRODUCT_IMAGE_ACCEPT,
  PRODUCT_IMAGE_MAX_COUNT,
} from '../productModel';
import type { ProductImage as ProductImageRecord } from '../../../types';
import ProductImage from './ProductImage';

export interface PendingProductImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface ProductImagePickerProps {
  dragActive: boolean;
  imageCount: number;
  pendingImages: PendingProductImage[];
  savedImages: ProductImageRecord[];
  onClear: () => void;
  onDragActiveChange: (active: boolean) => void;
  onEmptyDrop: () => void;
  onFiles: (files?: FileList | File[] | null) => void;
  onRemovePending: (imageId: string) => void;
  onRemoveSaved: (imageId: string) => void;
}

export default function ProductImagePicker({
  dragActive,
  imageCount,
  pendingImages,
  savedImages,
  onClear,
  onDragActiveChange,
  onEmptyDrop,
  onFiles,
  onRemovePending,
  onRemoveSaved,
}: ProductImagePickerProps) {
  const { t } = useTranslation();

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    onDragActiveChange(false);
    const dropped = Array.from(event.dataTransfer.files);
    if (!dropped.length) {
      onEmptyDrop();
      return;
    }
    onFiles(dropped);
  }

  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    const imageFiles = Array.from(event.clipboardData?.items ?? [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    if (!imageFiles.length) return;
    event.preventDefault();
    onFiles(imageFiles);
  }

  return (
    <div className="form-group">
      <label className="form-label">{t('features.products.productForm.imageLabel')}</label>
      <div
        className={`product-image-picker ${dragActive ? 'is-dragover' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDragActiveChange(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDragActiveChange(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          onDragActiveChange(false);
        }}
        onDrop={handleDrop}
        onPaste={handlePaste}
        tabIndex={0}
      >
        {imageCount ? (
          <div className="product-image-preview-grid">
            {savedImages.map((image, index) => (
              <div key={image.id} className="product-image-preview-item">
                <ProductImage src={image.url} alt={t('features.products.productForm.savedImageAlt', { index: index + 1 })} />
                <button type="button" className="btn btn-text btn-xs" onClick={() => onRemoveSaved(image.id)}>
                  {t('common.delete')}
                </button>
              </div>
            ))}
            {pendingImages.map((image, index) => (
              <div key={image.id} className="product-image-preview-item">
                <img src={image.previewUrl} alt={t('features.products.productForm.pendingImageAlt', { index: savedImages.length + index + 1 })} />
                <button type="button" className="btn btn-text btn-xs" onClick={() => onRemovePending(image.id)}>
                  {t('common.delete')}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <label className="product-image-empty product-image-dropzone" htmlFor="product-image-upload">
            <strong>{t('features.products.productForm.dropImageTitle')}</strong>
            <span>{t('features.products.productForm.dropImageHint')}</span>
          </label>
        )}
        <div className="product-image-controls">
          <div className="product-image-actions">
            <label className="btn btn-secondary btn-sm" htmlFor="product-image-upload">{t('features.products.productForm.uploadImage')}</label>
            <input
              id="product-image-upload"
              type="file"
              multiple
              accept={PRODUCT_IMAGE_ACCEPT}
              style={{ display: 'none' }}
              onChange={(event) => {
                onFiles(event.target.files);
                event.currentTarget.value = '';
              }}
            />
            <button type="button" className="btn btn-text btn-sm" onClick={onClear} disabled={!imageCount}>{t('common.clear')}</button>
          </div>
          <span className="form-help-text">
            {t('features.products.productForm.imageHelp', { max: PRODUCT_IMAGE_MAX_COUNT, count: imageCount })}
          </span>
        </div>
      </div>
    </div>
  );
}
