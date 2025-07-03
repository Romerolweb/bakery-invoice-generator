import './[id]/print.css'; // Import print styles here

export default function ReceiptViewLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* You might want to add meta tags or a title specific to the print view here */}
      </head>
      <body className="bg-white"> {/* Ensure a white background for printing */}
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  );
}
