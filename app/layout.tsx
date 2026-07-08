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
  title: "FastFind — Compare Fast Food Prices Near You",
  description: "Find the cheapest Chipotle, Taco Bell, Wendy's, Domino's, Marco's Pizza, Chili's, Whataburger, Popeyes, Wingstop, Papa John's, Panera, and Subway near you. Per-location prices on an interactive map.",
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
