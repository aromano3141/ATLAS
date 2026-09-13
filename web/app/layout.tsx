import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Reality Sync", description: "Review conflicting facts, verify approved repairs, and adapt your day.", icons: { icon: "/favicon.svg" } };
export default function RootLayout({children}:{children:React.ReactNode}) { return <html lang="en"><body>{children}</body></html>; }
