import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Web3Provider } from '@/context/Web3Context'
import Navbar from '@/components/layout/Navbar'
import QueryProvider from '@/context/QueryProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Nakshatra Lending',
  description: 'Decentralized P2P Lending Platform',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-neutral-950 text-neutral-50 selection:bg-indigo-500/30 min-h-screen flex flex-col`}>
        <QueryProvider>
          <Web3Provider>
            <Navbar />
            <main className="flex-1">
              {children}
            </main>
          </Web3Provider>
        </QueryProvider>
      </body>
    </html>
  )
}
