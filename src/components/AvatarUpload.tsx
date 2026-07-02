/**
 * AvatarUpload — 头像上传组件
 *
 * Props: { currentUrl, userId, onUploaded, onClose }
 * Shows current avatar with a file input to upload a new one.
 */

import { useState, useRef, useCallback } from 'react';
import * as userService from '../services/userService';

interface AvatarUploadProps {
  currentUrl: string | null;
  userId: string;
  onUploaded: (url: string) => void;
  onClose: () => void;
}

export default function AvatarUpload({ currentUrl, userId, onUploaded, onClose }: AvatarUploadProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      setError('图片大小不能超过 2MB');
      return;
    }

    setSelectedFile(file);
    setError(null);

    const reader = new FileReader();
    reader.onload = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    try {
      const url = await userService.uploadAvatar(userId, selectedFile);
      onUploaded(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
      setUploading(false);
    }
  }, [selectedFile, userId, onUploaded]);

  const displayUrl = preview || currentUrl;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xs mx-4 bg-white rounded-xl border border-stone-200 shadow-xl animate-slideUp p-5 text-center">
        <h2 className="text-base font-bold text-stone-800 mb-4">更换头像</h2>

        {/* Current preview */}
        <div className="flex justify-center mb-4">
          {displayUrl ? (
            <img
              src={displayUrl}
              alt="Avatar preview"
              className="w-28 h-28 rounded-full object-cover border-2 border-stone-200"
            />
          ) : (
            <div className="w-28 h-28 rounded-full bg-stone-100 border-2 border-stone-200 flex items-center justify-center">
              <span className="text-stone-400 text-sm">无头像</span>
            </div>
          )}
        </div>

        {/* File input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 transition"
        >
          选择图片
        </button>

        {selectedFile && (
          <p className="text-xs text-stone-400 mt-2">
            {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
          </p>
        )}

        {error && (
          <p className="text-xs text-red-500 mt-2">{error}</p>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm font-medium rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-50 transition"
          >
            取消
          </button>
          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="flex-1 py-2 text-sm font-medium rounded-lg bg-[#b71c1c] text-white hover:bg-[#8b0000] transition disabled:opacity-50"
          >
            {uploading ? '上传中...' : '上传'}
          </button>
        </div>
      </div>
    </div>
  );
}
