import { useState, useEffect } from 'react';
import PopupPreloadManager from './popupPreloadManager';

export function usePopupPreloadStatus() {
  const [isReady, setIsReady] = useState(false);
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    const checkStatus = () => {
      const manager = PopupPreloadManager.getInstance();
      const currentStatus = manager.getStatus();
      const ready = manager.isReadyForFastPopup();
      
      setStatus(currentStatus);
      setIsReady(ready);
    };

    // Check immediately
    checkStatus();

    // Check every 500ms during preloading
    const interval = setInterval(checkStatus, 500);

    // Stop checking once ready
    const stopInterval = () => {
      const manager = PopupPreloadManager.getInstance();
      if (manager.isReadyForFastPopup()) {
        clearInterval(interval);
      }
    };

    // Check every 2 seconds if we should stop
    const stopChecker = setInterval(stopInterval, 2000);

    return () => {
      clearInterval(interval);
      clearInterval(stopChecker);
    };
  }, []);

  return { isReady, status };
} 