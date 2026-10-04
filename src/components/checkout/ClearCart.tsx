'use client';

import { useEffect } from 'react';
import { useCart } from '@/stores/cart';

export function ClearCart() {
  useEffect(() => {
    void Promise.resolve(useCart.persist.rehydrate()).then(() => useCart.getState().clear());
  }, []);
  return null;
}
