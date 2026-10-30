import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Frimin — Autonomous market evidence & narrative desk',
  description:
    'Frimin autonomous creator narrative convergence, direct blockchain RPC, live Level-2 orderbook execution, symmetric bull & bear debate, and Ed25519-signed practice ledger.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F5F6F8] text-[#111214] antialiased selection:bg-[#CBFB00] selection:text-[#111214]">
        {children}
      </body>
    </html>
  );
}
