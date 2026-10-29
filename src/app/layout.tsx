import type { Metadata } from "next";
import { Inter, Lora, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
  style: ["normal", "italic"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "OnlyDevs | Quiet Web Reader",
  description:
    "A peaceful, distraction-free small web reader with edge proxying and serene reading aesthetics.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${lora.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var storedTheme = localStorage.getItem('theme') || 'auto';
                var hour = new Date().getHours();
                var isNight = hour < 6 || hour >= 18;
                if (storedTheme === 'dark' || (storedTheme === 'auto' && isNight)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground flex flex-col font-sans antialiased selection:bg-primary/10 selection:text-primary transition-colors duration-200 relative overflow-x-hidden">
        <Sidebar />
        <main className="flex-1 w-full flex flex-col min-w-0 relative z-10">
          {children}
        </main>
      </body>
    </html>
  );
}
