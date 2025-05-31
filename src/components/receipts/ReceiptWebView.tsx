'use client';

import { useState, useEffect } from 'react';
import type { Receipt } from '@/lib/types';
import { ReceiptContent } from './components/ReceiptContent';
import { PrintToolbar } from './components/PrintToolbar';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorMessage } from './components/ErrorMessage';

interface ReceiptWebViewProps {
  receiptId: string;
}

interface ApiResponse {
  success: boolean;
  data?: Receipt;
  error?: string;
}

export function ReceiptWebView({ receiptId }: ReceiptWebViewProps) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReceipt = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/receipts/${receiptId}`);
        const result: ApiResponse = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Failed to fetch receipt');
        }

        if (!result.data) {
          throw new Error('No receipt data received');
        }

        setReceipt(result.data);
        
        // Set page title for printing
        document.title = `Invoice ${result.data.receipt_id}`;

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(errorMessage);
        console.error('Error fetching receipt:', err);
      } finally {
        setLoading(false);
      }
    };

    if (receiptId) {
      fetchReceipt();
    }
  }, [receiptId]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error} receiptId={receiptId} />;
  }

  if (!receipt) {
    return <ErrorMessage message="Receipt not found" receiptId={receiptId} />;
  }

  return (
    <>
      <PrintToolbar receiptId={receipt.receipt_id} />
      <ReceiptContent receipt={receipt} />
    </>
  );
}
