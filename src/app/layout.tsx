import type { Metadata } from "next";
import { JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorkerRegistration } from "./components/ServiceWorkerRegistration";

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Auton Visualizer",
  description: "An autonomous robotics path visualizer and planner",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={jetBrainsMono.variable}>
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
