import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { apiClient } from "../lib/api-client";

export function useStoreUser() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [userId, setUserId] = useState(null);
  const [isStoring, setIsStoring] = useState(false);

  useEffect(() => {
    if (!isSignedIn || !user) {
      setUserId(null);
      return;
    }

    async function createUser() {
      try {
        setIsStoring(true);
        
        const headers = {
          'x-user-email': user.primaryEmailAddress?.emailAddress || '',
          'x-user-name': user.fullName || '',
          'x-user-image': user.imageUrl || '',
        };

        // Call the backend to get or create the user
        const response = await apiClient.get('/api/users/me', { headers });
        setUserId(response.id);
      } catch (error) {
        console.error('Failed to store user:', error);
      } finally {
        setIsStoring(false);
      }
    }

    createUser();
  }, [isSignedIn, user]);

  return {
    isLoading: !isLoaded || isStoring,
    isAuthenticated: isSignedIn && userId !== null,
  };
}
