import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ranjirams Hotel Management System",
  description: "Hotel attendance, shift, payroll and employee management system.",
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
