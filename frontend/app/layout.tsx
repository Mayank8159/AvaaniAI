import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Wife",
  description: "AI Wife VRM Viewer",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          width: "100vw",
          height: "100vh",
          overflow: "hidden",
          backgroundColor: "#121212",
        }}
      >
        {children}
      </body>
    </html>
  );
}
