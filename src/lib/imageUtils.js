// src/lib/imageUtils.js
export function compressImage(dataUrl, maxW = 1400, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const scale = Math.min(1, maxW / Math.max(img.width, img.height))
      const w = Math.round(img.width * scale)
      const h = Math.round(img.height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}

export function imageSizeMB(dataUrl) {
  return (dataUrl.length * 0.75) / 1024 / 1024
}

export const MAX_IMAGE_SIZE_MB = 2
