"use client";

import React from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

const MainLayout = ({ children }) => {
  const { isLoaded, isSignedIn } = useUser();
  const router = useRouter();

  // Redirect to sign-in if not authenticated
  React.useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) {
    return null; // or a loading spinner
  }

  return (
    <div className="container mx-auto mt-24 mb-20 px-4">
      {children}
    </div>
  );
};

export default MainLayout;
