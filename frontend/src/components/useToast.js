import { useCallback, useRef, useState } from 'react';

export default function useToast() {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const show = useCallback((message, type = 'info') => {
    clearTimeout(timer.current);
    setToast({ message, type });
    timer.current = setTimeout(() => setToast(null), type === 'error' ? 6000 : 3500);
  }, []);

  const clear = useCallback(() => {
    clearTimeout(timer.current);
    setToast(null);
  }, []);

  return { toast, show, clear };
}
