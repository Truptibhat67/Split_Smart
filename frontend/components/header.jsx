// "use client";

// import React, { useEffect, useState } from "react";
// import { Button } from "./ui/button";
// import { LayoutDashboard } from "lucide-react";
// import Link from "next/link";
// import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
// import { BarLoader } from "react-spinners";
// import Image from "next/image";
// import { usePathname } from "next/navigation";

// export default function Header() {
//   const { isSignedIn, isLoaded } = useUser();
//   const path = usePathname();
//   const [isClient, setIsClient] = useState(false);

//   useEffect(() => {
//     setIsClient(true);
//   }, []);

//   if (!isClient || !isLoaded) {
//     return (
//       <header className="fixed top-0 w-full border-b bg-white/95 backdrop-blur z-50 supports-[backdrop-filter]:bg-white/60">
//         <nav className="container mx-auto px-4 h-16 flex items-center justify-between">
//           <div className="h-11 w-auto"></div>
//           <div className="flex items-center">
//             <BarLoader color="#16a34a" />
//           </div>
//         </nav>
//       </header>
//     );
//   }

//   return (
//     <header className="fixed top-0 w-full border-b bg-white/95 backdrop-blur z-50 supports-[backdrop-filter]:bg-white/60">
//       <nav className="container mx-auto px-4 h-16 flex items-center justify-between">
//         <Link href="/" className="flex items-center gap-2">
//           <Image
//             src={"/logos/logo.png"}
//             alt="Vehiql Logo"
//             width={200}
//             height={60}
//             className="h-11 w-auto object-contain"
//           />
//         </Link>

//         {path === "/" && (
//           <div className="hidden md:flex items-center gap-6">
//             <Link
//               href="#features"
//               className="text-sm font-medium hover:text-green-600 transition"
//             >
//               Features
//             </Link>
//             <Link
//               href="#how-it-works"
//               className="text-sm font-medium hover:text-green-600 transition"
//             >
//               How It Works
//             </Link>
//           </div>
//         )}

//         <div className="flex items-center gap-4">
//           {isSignedIn ? (
//             <>
//               <Link href="/dashboard">
//                 <Button
//                   variant="outline"
//                   className="hidden md:inline-flex items-center gap-2 hover:text-green-600 hover:border-green-600 transition"
//                 >
//                   <LayoutDashboard className="h-4 w-4" />
//                   Dashboard
//                 </Button>
//               </Link>
//               <Button variant="ghost" className="md:hidden w-10 h-10 p-0">
//                 <LayoutDashboard className="h-4 w-4" />
//               </Button>
//               <UserButton afterSignOutUrl="/" />
//             </>
//           ) : (
//             <>
//               <SignInButton mode="modal">
//                 <Button variant="ghost" className="hover:text-green-600">
//                   Sign In
//                 </Button>
//               </SignInButton>
//               <SignUpButton mode="modal">
//                 <Button className="bg-green-600 hover:bg-green-700">
//                   Get Started
//                 </Button>
//               </SignUpButton>
//             </>
//           )}
//         </div>
//       </nav>
//     </header>
//   );
// }
//                 Get Started
//               </Button>
//             </SignUpButton>
//           </Unauthenticated>
//         </div>
//       </nav>
//       {isLoading && <BarLoader width={"100%"} color="#36d7b7" />}
//     </header>
//   );
// }


"use client";

import React, { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { SignInButton, SignUpButton, UserButton, useUser } from "@clerk/nextjs";
import { BarLoader } from "react-spinners";
import Image from "next/image";
import { usePathname } from "next/navigation";

export default function Header() {
  const { isSignedIn, isLoaded } = useUser();
  const path = usePathname();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  if (!isClient || !isLoaded) {
    return (
      <header className="fixed top-0 w-full border-b bg-white/95 backdrop-blur z-50 supports-[backdrop-filter]:bg-white/60">
        <nav className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="h-11 w-auto"></div>
          <div className="flex items-center">
            <BarLoader color="#16a34a" />
          </div>
        </nav>
      </header>
    );
  }

  return (
    <header className="fixed top-0 w-full border-b bg-white/95 backdrop-blur z-50 supports-[backdrop-filter]:bg-white/60">
      <nav className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src={"/logos/logo.png"}
            alt="Split Smart Logo"
            width={200}
            height={60}
            className="h-11 w-auto object-contain"
          />
        </Link>

        {path === "/" && (
          <div className="hidden md:flex items-center gap-6">
            <Link
              href="#features"
              className="text-sm font-medium hover:text-green-600 transition"
            >
              Features
            </Link>
            <Link
              href="#how-it-works"
              className="text-sm font-medium hover:text-green-600 transition"
            >
              How It Works
            </Link>
          </div>
        )}

        <div className="flex items-center gap-4">
          {isSignedIn ? (
            <>
              <Link href="/dashboard">
                <Button
                  variant="outline"
                  className="hidden md:inline-flex items-center gap-2 hover:text-green-600 hover:border-green-600 transition"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
              <Button variant="ghost" className="md:hidden w-10 h-10 p-0">
                <LayoutDashboard className="h-4 w-4" />
              </Button>
              <UserButton afterSignOutUrl="/" />
            </>
          ) : (
            <>
              <SignInButton mode="modal">
                <Button variant="ghost" className="hover:text-green-600">
                  Sign In
                </Button>
              </SignInButton>
              <SignUpButton mode="modal">
                <Button className="bg-green-600 hover:bg-green-700">
                  Get Started
                </Button>
              </SignUpButton>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}