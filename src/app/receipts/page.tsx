'use client';

import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns'; // Keep parseISO

import type { Receipt } from '@/lib/types';
import { getReceipts, getReceiptPdfPath } from '@/lib/actions/receipts'; // Assume getReceiptPdfPath exists

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge'; // To show Tax Invoice status
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, PlusCircle } from 'lucide-react'; // Keep PlusCircle if needed elsewhere, or import inline
import Link from 'next/link'; // For linking back to create new


export default function ReceiptsHistoryPage() {
  const { toast } = useToast();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReceipts = async () => {
    setIsLoading(true);
    try {
      const data = await getReceipts();
      setReceipts(data);
    } catch (error) {
      console.error('Failed to fetch receipts:', error);
       toast({
            title: "Error",
            description: "Could not load receipt history. Please try again later.",
            variant: "destructive",
        });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReceipts();
  }, []); // Fetch only once

   const handleDownloadPdf = async (receiptId: string) => {
    toast({ title: "Download Initiated", description: "Checking for PDF..." });
     try {
        // NOTE: This action currently just gets the *path* on the server.
        // For a real web download, you need an API endpoint.
        const pdfPath = await getReceiptPdfPath(receiptId);
        if (pdfPath) {
            // Simulate download - In a real app, you'd redirect to an API endpoint
            // e.g., window.location.href = `/api/download-receipt?id=${receiptId}`;
             alert(`PDF stub is available at server path: ${pdfPath}\n\nA real app would initiate a download here.`);
             toast({ title: "PDF Ready (Stub)", description: `PDF stub for ${receiptId.substring(0, 8)}... exists.`, variant: "default"});
        } else {
            toast({ title: "PDF Not Found", description: `Could not find the PDF for receipt ${receiptId.substring(0, 8)}... It might need to be regenerated.`, variant: "destructive" });
        }
    } catch (error) {
        console.error("Error getting PDF path:", error);
        toast({ title: "Error", description: "Could not initiate PDF download.", variant: "destructive" });
    }
  };


  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
         <div>
            <h1 className="text-2xl font-semibold">Receipt History</h1>
            <p className="text-muted-foreground">View previously generated receipts.</p>
        </div>
         <Button asChild>
            <Link href="/">
                <PlusCircle className="mr-2 h-4 w-4" /> Create New Receipt
            </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generated Receipts</CardTitle>
           <CardDescription>List of all receipts generated.</CardDescription>
        </CardHeader>
        <CardContent>
             {isLoading ? (
                 <div className="flex justify-center items-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            ) : receipts.length === 0 ? (
                 <p className="text-center text-muted-foreground py-4">No receipts found yet. Create one to see it here!</p>
            ): (
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Receipt ID</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Total Amount</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {receipts.map((receipt) => (
                    <TableRow key={receipt.receipt_id}>
                    <TableCell className="font-mono text-xs">{receipt.receipt_id.substring(0, 8)}...</TableCell>
                    <TableCell>{format(parseISO(receipt.date_of_purchase), 'dd/MM/yyyy')}</TableCell>
                     <TableCell>
                         {receipt.customer_snapshot.customer_type === 'business'
                            ? receipt.customer_snapshot.business_name
                            : `${receipt.customer_snapshot.first_name} ${receipt.customer_snapshot.last_name || ''}`
                         }
                     </TableCell>
                    <TableCell>${receipt.total_inc_GST.toFixed(2)}</TableCell>
                     <TableCell>
                         {receipt.is_tax_invoice ? (
                             <Badge variant="default">Tax Invoice</Badge>
                         ) : (
                             <Badge variant="secondary">Receipt</Badge>
                         )}
                     </TableCell>
                    <TableCell className="text-right space-x-2">
                       {/* Placeholder: Add view/details button later */}
                       {/* <Button variant="ghost" size="icon" title="View Details">
                            <FileText className="h-4 w-4" />
                            <span className="sr-only">View Details</span>
                        </Button> */}
                       <Button variant="outline" size="sm" onClick={() => handleDownloadPdf(receipt.receipt_id)}>
                            <Download className="mr-2 h-4 w-4" />
                            PDF (Stub)
                        </Button>
                    </TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
             )}
        </CardContent>
      </Card>
    </div>
  );
}

// Removed the inline SVG for PlusCircle as it's imported from lucide-react now.
