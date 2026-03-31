import { useCallback, useState } from 'react';

interface UploadState {
  isUploading: boolean;
  progress: number;
  error: string | null;
  isCompressing: boolean;
}

const DISABLED_MESSAGE = 'La subida de miniaturas esta desactivada en esta version de FrameFlow.';

export function useImageUpload(_cardId: string) {
  const [state, setState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
    isCompressing: false,
  });

  const rejectDisabled = useCallback(async () => {
    const error = new Error(DISABLED_MESSAGE);
    setState((previous) => ({ ...previous, error: DISABLED_MESSAGE, isUploading: false, isCompressing: false }));
    throw error;
  }, []);

  const downloadImage = useCallback((url: string, filename: string) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  }, []);

  return {
    ...state,
    uploadImage: rejectDisabled,
    compressAndUpload: rejectDisabled,
    deleteImages: async () => undefined,
    downloadImage,
  };
}
