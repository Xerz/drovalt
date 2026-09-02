import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@/app/globals.css';
import { MerchantApp } from '@/components/merchant-app';
import { Providers } from '@/components/providers';

window.__DROVALT_HASH_ROUTING__ = true;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Providers>
      <MerchantApp />
    </Providers>
  </StrictMode>,
);
