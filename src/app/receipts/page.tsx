// src/app/receipts/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns'; // Keep parseISO

import type { Receipt } from '@/lib/types';
import { getAllReceipts } from '@/lib/actions/receipts'; // Import getAllReceipts

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge'; // To show Tax Invoice status
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, PlusCircle } from 'lucide-react'; // Keep PlusCircle if needed elsewhere, or import inline
import Link from 'next/link'; // For linking back to create new
import { logger } from '@/lib/services/logging'; // Import logger


const CLIENT_LOG_PREFIX = 'ReceiptsHistoryPage';

export default function ReceiptsHistoryPage() {
  const { toast } = useToast();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReceipts = async () => {
    logger.info(CLIENT_LOG_PREFIX, 'Starting fetchReceipts...');
    setIsLoading(true);
    try {
      logger.debug(CLIENT_LOG_PREFIX, 'Calling getAllReceipts action...');
      const data = await getAllReceipts(); // Use getAllReceipts here
      logger.info(CLIENT_LOG_PREFIX, `Fetched ${data.length} receipts.`);
      setReceipts(data);
    } catch (error) {
      logger.error(CLIENT_LOG_PREFIX, 'Failed to fetch receipts', error);
       toast({
            title: "Error",
            description: "Could not load invoice history. Please try again later.", // Updated text
            variant: "destructive",
        });
    } finally {
      setIsLoading(false);
      logger.info(CLIENT_LOG_PREFIX, 'Finished fetchReceipts.');
    }
  };

  useEffect(() => {
    fetchReceipts();
  }, []); // Fetch only once

   const handleDownloadPdf = (receiptId: string) => {
        const funcPrefix = `${CLIENT_LOG_PREFIX}:handleDownloadPdf:${receiptId.substring(0,8)}`;
        logger.info(funcPrefix, `Initiating PDF download request.`);
        toast({ title: "Download Initiated", description: `Preparing PDF for ${receiptId.substring(0, 8)}...` });
        try {
            // Directly open the API endpoint for download
            window.open(`/api/download-pdf?id=${receiptId}`, '_blank');
            logger.info(funcPrefix, 'PDF download window opened.');
            toast({ title: "PDF Download Started", description: `Attempting to download PDF...`, variant: "default" });
        } catch (error) {
            logger.error(funcPrefix, "Error initiating PDF download", error);
            toast({ title: "Error", description: "Could not initiate PDF download.", variant: "destructive" });
        }
  };


  return (
    <div className="space-y-6">
       <div className="flex justify-between items-center">
         <div>
            <h1 className="text-2xl font-semibold">Invoice History</h1>
            <p className="text-muted-foreground">View previously generated invoices.</p>
        </div>
         <Button asChild>
            <Link href="/">
                <PlusCircle className="mr-2 h-4 w-4" /> Create New Invoice
            </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Generated Invoices</CardTitle>
           <CardDescription>List of all invoices generated.</CardDescription>
        </CardHeader>
        <CardContent>
             {isLoading ? (
                 <div className="flex justify-center items-center h-40">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                     <span className="ml-2">Loading history...</span>
                </div>
            ) : receipts.length === 0 ? (
                 <p className="text-center text-muted-foreground py-4">No invoices found yet. Create one to see it here!</p> // Updated text
            ): (
            <Table>
                <TableHeader>
                <TableRow>
                    <TableHead>Invoice ID</TableHead>
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
                            : `${receipt.customer_snapshot.first_name || ''} ${receipt.customer_snapshot.last_name || ''}`.trim()
                         }
                     </TableCell>
                    <TableCell>${receipt.total_inc_GST.toFixed(2)}</TableCell>
                     <TableCell>
                         {receipt.is_tax_invoice ? (
                             <Badge variant="default">Tax Invoice</Badge>
                         ) : (
                             <Badge variant="secondary">Invoice</Badge> // Updated text
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
                            Download PDF
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
