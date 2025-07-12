// src/app/receipts/page.tsx
"use client";

import { useState, useEffect } from "react";

import type { Receipt } from "@/lib/types";
import { getAllReceipts } from "@/lib/actions/receipts";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { PlusCircle } from "lucide-react";
import Link from "next/link";
import { ReceiptsTable } from "@/components/receipts/ReceiptsTable"; // Import the new table component

const CLIENT_LOG_PREFIX = "ReceiptsHistoryPage";

export default function ReceiptsHistoryPage() {
  const { toast } = useToast();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReceipts = useCallback(async () => {
    console.info(CLIENT_LOG_PREFIX, "Starting fetchReceipts...");
    setIsLoading(true);
    try {
      console.debug(CLIENT_LOG_PREFIX, "Calling getAllReceipts action...");
      const data = await getAllReceipts();
      console.info(CLIENT_LOG_PREFIX, `Fetched ${data.length} receipts.`);
      setReceipts(data);
    } catch (error) {
      console.error(
        CLIENT_LOG_PREFIX,
        "Failed to fetch receipts",
        error instanceof Error ? error : new Error(String(error)),
      );
      toast({
        title: "Error Loading History",
        description: "Could not load invoice history. Please try again later.",
        variant: "destructive",
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
      console.info(CLIENT_LOG_PREFIX, "Finished fetchReceipts.");
    }
  }, [toast]);

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

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
          {/* Use the new ReceiptsTable component */}
          <ReceiptsTable receipts={receipts} isLoading={isLoading} />
        </CardContent>
      </Card>
    </div>
  );
}
