// src/app/receipts/page.tsx
"use client";

import { useState, useEffect } from "react";
import { format, parseISO } from "date-fns"; // Keep parseISO

import type { Receipt } from "@/lib/types";
import { getAllReceipts } from "@/lib/actions/receipts"; // Use getAllReceipts from actions

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge"; // To show Tax Invoice status
import { useToast } from "@/hooks/use-toast";
import { Loader2, PlusCircle } from "lucide-react"; // Removed Download, AlertCircle
import Link from "next/link"; // For linking back to create new
import { ReceiptViewButton } from "@/components/receipts/ReceiptViewButton"; // Add receipt view button

const CLIENT_LOG_PREFIX = "ReceiptsHistoryPage";

export default function ReceiptsHistoryPage() {
  const { toast } = useToast();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReceipts = async () => {
    console.info(CLIENT_LOG_PREFIX, "Starting fetchReceipts..."); // Use console.info
    setIsLoading(true);
    try {
      console.debug(CLIENT_LOG_PREFIX, "Calling getAllReceipts action..."); // Use console.debug
      const data = await getAllReceipts(); // Use getAllReceipts action here
      console.info(CLIENT_LOG_PREFIX, `Fetched ${data.length} receipts.`); // Use console.info
      // Sorting is now handled in the server action
      setReceipts(data);
    } catch (error) {
      console.error(CLIENT_LOG_PREFIX, "Failed to fetch receipts", error instanceof Error ? error : new Error(String(error))); // Use console.error
      toast({
        title: "Error Loading History",
        description: "Could not load invoice history. Please try again later.", // Updated text
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
      console.info(CLIENT_LOG_PREFIX, "Finished fetchReceipts."); // Use console.info
    }
  };

  useEffect(() => {
    fetchReceipts();
  }, []); // Fetch only once

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold">Invoice History</h1>
          <p className="text-muted-foreground">
            View previously generated invoices.
          </p>
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
          <CardDescription>
            List of all invoices generated, sorted by most recent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading history...</span>
            </div>
          ) : receipts.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">
              No invoices found yet. Create one to see it here!
            </p> // Updated text
          ) : (
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
                    <TableCell className="font-mono text-xs">
                      {receipt.receipt_id.substring(0, 8)}...
                    </TableCell>
                    <TableCell>
                      {/* Ensure date is parsed correctly before formatting */}
                      {receipt.date_of_purchase
                        ? format(
                            parseISO(receipt.date_of_purchase),
                            "dd/MM/yyyy",
                          )
                        : "N/A"}
                    </TableCell>
                    <TableCell>
                      {receipt.customer_snapshot.customer_type === "business"
                        ? receipt.customer_snapshot.business_name
                        : `${receipt.customer_snapshot.first_name || ""} ${receipt.customer_snapshot.last_name || ""}`.trim()}
                      {receipt.customer_snapshot.email
                        ? ` (${receipt.customer_snapshot.email})`
                        : ""}
                    </TableCell>
                    <TableCell>${receipt.total_inc_GST.toFixed(2)}</TableCell>
                    <TableCell>
                      {receipt.is_tax_invoice ? (
                        <Badge variant="default">Tax Invoice</Badge>
                      ) : (
                        <Badge variant="secondary">Invoice</Badge> // Standard Invoice
                      )}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <ReceiptViewButton 
                        receiptId={receipt.receipt_id}
                        variant="view"
                      />
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
