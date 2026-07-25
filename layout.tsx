import './globals.css';
import ClientOnly from './client-only';

export { metadata } from './seo-config';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&family=Epilogue:wght@300;400;500;600;700;800&display=swap" />
      </head>
      <body>
        <ClientOnly>{children}</ClientOnly>
      </body>
    </html>
  );
}
