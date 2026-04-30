import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auton Path Planner",
  description: "A path planner for autonomous robotics",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
