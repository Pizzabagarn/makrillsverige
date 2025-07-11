// Service Worker registration utility
// Handles registration, updates, and messaging with the service worker

export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      console.log('🚫 Service Worker: Not in browser environment');
      resolve(null);
      return;
    }

    if (!('serviceWorker' in navigator)) {
      console.log('🚫 Service Worker: Not supported in this browser');
      resolve(null);
      return;
    }

    console.log('🚀 Service Worker: Registering...');

    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('✅ Service Worker: Registered successfully');
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          console.log('🔄 Service Worker: Update found');
          const newWorker = registration.installing;
          
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  console.log('🔄 Service Worker: New version available');
                  // New version available, could show update prompt
                } else {
                  console.log('✅ Service Worker: Ready for offline use');
                }
              }
            });
          }
        });

        // Listen for messages from service worker
        navigator.serviceWorker.addEventListener('message', (event) => {
          console.log('📨 Service Worker: Message received:', event.data);
        });

        resolve(registration);
      })
      .catch((error) => {
        console.error('❌ Service Worker: Registration failed:', error);
        reject(error);
      });
  });
}

export function unregisterServiceWorker(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      resolve(false);
      return;
    }

    navigator.serviceWorker.ready
      .then((registration) => {
        return registration.unregister();
      })
      .then((success) => {
        if (success) {
          console.log('✅ Service Worker: Unregistered successfully');
        } else {
          console.log('❌ Service Worker: Failed to unregister');
        }
        resolve(success);
      })
      .catch((error) => {
        console.error('❌ Service Worker: Unregistration failed:', error);
        resolve(false);
      });
  });
}

export function clearServiceWorkerCache(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      resolve();
      return;
    }

    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'CLEAR_CACHE'
      });
    }

    resolve();
  });
}

export function checkServiceWorkerStatus(): Promise<'supported' | 'registered' | 'not-supported'> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve('not-supported');
      return;
    }

    if (!('serviceWorker' in navigator)) {
      resolve('not-supported');
      return;
    }

    navigator.serviceWorker.ready
      .then(() => {
        resolve('registered');
      })
      .catch(() => {
        resolve('supported');
      });
  });
}

// Hook for easy service worker management in React components
export function useServiceWorker() {
  const register = () => registerServiceWorker();
  const unregister = () => unregisterServiceWorker();
  const clearCache = () => clearServiceWorkerCache();
  const checkStatus = () => checkServiceWorkerStatus();

  return {
    register,
    unregister,
    clearCache,
    checkStatus
  };
} 