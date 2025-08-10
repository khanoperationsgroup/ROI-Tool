import "./globals.css"

export const metadata = {
  title: "Khan Operations — ROI Calculator",
  description: "Quantify the $-value of working with Khan Operations (Blueprint, ODL, Accelerator).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50">{children}</body>
    </html>
  );
}
