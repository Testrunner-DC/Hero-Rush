import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';
import * as userService from '../services/userService';
import type { UserRow } from '../types/database';
import type { ProfileFormData } from '../types/user';

interface UseProfileReturn {
  profile: UserRow | null;
  isLoading: boolean;
  error: string | null;
  updateProfile: (data: ProfileFormData) => Promise<boolean>;
  uploadAvatar: (file: File) => Promise<string | null>;
  refresh: () => Promise<void>;
}

/** Hook for managing user profile data */
export function useProfile(): UseProfileReturn {
  const { user, isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<UserRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!isAuthenticated || !user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const data = await userService.getProfile(user.id);
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setIsLoading(false);
    }
  }, [user, isAuthenticated]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateProfileHandler = useCallback(async (data: ProfileFormData): Promise<boolean> => {
    if (!user) return false;
    const { error: err } = await userService.updateProfile(user.id, data);
    if (err) {
      setError(err.message);
      return false;
    }
    await fetchProfile();
    return true;
  }, [user, fetchProfile]);

  const uploadAvatarHandler = useCallback(async (file: File): Promise<string | null> => {
    if (!user) return null;
    try {
      const url = await userService.uploadAvatar(user.id, file);
      await fetchProfile();
      return url;
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
      return null;
    }
  }, [user, fetchProfile]);

  return {
    profile,
    isLoading,
    error,
    updateProfile: updateProfileHandler,
    uploadAvatar: uploadAvatarHandler,
    refresh: fetchProfile,
  };
}
