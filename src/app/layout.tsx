import type { Metadata } from 'next';
// Removed Geist font import
import './globals.css';
import React from 'react'; // Explicitly import React
import { cn } from '@/lib/utils';
import { SidebarProvider, Sidebar, SidebarHeader, SidebarContent, SidebarFooter, SidebarTrigger, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarInset } from '@/components/ui/sidebar'; // Assuming sidebar component exists
import { Toaster } from "@/components/ui/toaster";
import Link from 'next/link';
import { Home, Settings, Users, FileText, ShoppingBag } from 'lucide-react';

// Removed Geist font loading

export const metadata: Metadata = {
  title: "Baker's Invoice", // Updated title
  description: 'Generate invoices for your bakery business', // Updated description
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Removed font variable class from body */}
      <body className={cn('antialiased')}>
        <SidebarProvider>
          <Sidebar>
            <SidebarHeader className="p-4">
              <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
                {/* Replace with SVG logo if available */}
                <ShoppingBag className="h-6 w-6 text-primary" />
                <span>Baker's Invoice</span>
              </Link>
            </SidebarHeader>
            <SidebarContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/">
                      <Home />
                      <span>New Invoice</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild>
                        <Link href="/receipts">
                            <FileText />
                            <span>Invoice History</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/customers">
                      <Users />
                      <span>Customers</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                 <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/products">
                      <ShoppingBag />
                      <span>Products</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <Link href="/settings">
                      <Settings />
                      <span>Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarContent>
            <SidebarFooter className="p-4 text-xs text-muted-foreground">
              {/* Footer content if needed */}
              &copy; {new Date().getFullYear()} Baker's Invoice
            </SidebarFooter>
          </Sidebar>
          <SidebarInset>
            <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background px-4 md:px-6 lg:h-[60px]">
               <div className="flex items-center gap-4">
                 <SidebarTrigger className="md:hidden" /> {/* Hamburger for mobile */}
                 {/* Add Title or Breadcrumbs here */}
                 <h1 className="text-lg font-semibold">Dashboard</h1>
               </div>
               {/* Optional: Add user menu or other header items */}
            </header>
            <main className="flex-1 p-4 md:p-6">
              {children}
            </main>
          </SidebarInset>
        </SidebarProvider>
        <Toaster />
      </body>
    </html>
  );
}
