"use client";

import { createContext, useContext } from 'react';

// Create a simple context for our API client
const ApiContext = createContext(null);

export function ConvexClientProvider({ children }) {
  // This is a no-op provider since we're handling API calls through hooks
  return (
    <ApiContext.Provider value={{}}>
      {children}
    </ApiContext.Provider>
  );
}

// Export the context for potential future use
export const useApi = () => {
  const context = useContext(ApiContext);
  if (!context) {
    throw new Error('useApi must be used within an ApiProvider');
  }
  return context;
};
