import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { apiClient } from '../lib/api-client';

export function useApiMutation(endpoint, method = 'POST') {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const { isSignedIn, user } = useUser();

  const mutate = async (data) => {
    if (!isSignedIn) {
      throw new Error('User not authenticated');
    }

    try {
      setIsLoading(true);
      setError(null);
      
      const headers = {
        'x-user-email': user.primaryEmailAddress?.emailAddress || '',
        'x-user-name': user.fullName || '',
        'x-user-image': user.imageUrl || '',
      };

      let result;
      switch (method.toUpperCase()) {
        case 'POST':
          result = await apiClient.post(endpoint, data, { headers });
          break;
        case 'PUT':
          result = await apiClient.put(endpoint, data, { headers });
          break;
        case 'DELETE':
          result = await apiClient.delete(endpoint, { headers });
          break;
        default:
          throw new Error(`Unsupported method: ${method}`);
      }

      return result;
    } catch (err) {
      setError(err.message || 'Failed to perform mutation');
      console.error('API Mutation Error:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return { mutate, isLoading, error };
}
