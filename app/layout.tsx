import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AeroWorld } from "@/components/aero-world";
import { ViewTransitions } from "next-view-transitions";
const space = localFont({
  src: "../public/fonts/dynapuff.woff2",
  variable: "--font-space",
  display: "swap",
});
const manrope = localFont({
  src: "../public/fonts/nunito.woff2",
  variable: "--font-manrope",
  display: "swap",
});
export const metadata: Metadata = {
  title: "BLURT — Let it bloom",
  description:
    "Guess the picture in five reveals or bring your friends to Petal Party",
};
const themeScript = `try{const t=localStorage.getItem('blurt-theme');document.documentElement.dataset.theme=t||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light')}catch{}`;
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransitions>
      <html lang="en" suppressHydrationWarning>
        <head>
          <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        </head>
        <body className={`${space.variable} ${manrope.variable}`}>
          <AeroWorld />
          {children}
        </body>
      </html>
    </ViewTransitions>
  );
}
