import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { apiClient } from '../lib/api-client';

export function useApiQuery(endpoint, options = {}) {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const { isSignedIn, user } = useUser();

  useEffect(() => {
    if (!isSignedIn) {
      setIsLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const headers = {
          'x-user-email': user.primaryEmailAddress?.emailAddress || '',
          'x-user-name': user.fullName || '',
          'x-user-image': user.imageUrl || '',
        };

        const result = await apiClient.get(endpoint, { headers });
        setData(result);
      } catch (err) {
        setError(err.message || 'Failed to fetch data');
        console.error('API Query Error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [endpoint, isSignedIn, user]);

  return { data, isLoading, error };
}
