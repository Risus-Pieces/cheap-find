import type { Metadata } from "next";
import { Montserrat, Barlow_Condensed } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-montserrat",
  display: "swap",
});

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cheapotle — Compare Burrito Bowl Prices Near You",
  description: "Compare menu prices across restaurant locations on a live map. Find the best deal near you. Independent price comparison tool.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${montserrat.variable} ${barlowCondensed.variable}`}
    >
      <body className="h-full">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
