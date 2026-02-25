import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReceiptInvoiceInfo } from '@/components/receipts/components/ReceiptInvoiceInfo';

describe('ReceiptInvoiceInfo', () => {
  it('should display "Invoice #:" when isInvoice is true', () => {
    render(<ReceiptInvoiceInfo receiptId="123" date="2023-10-27" isInvoice={true} />);
    expect(screen.getByText('Invoice #:')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
  });

  it('should display "Receipt #:" when isInvoice is false', () => {
    render(<ReceiptInvoiceInfo receiptId="123" date="2023-10-27" isInvoice={false} />);
    expect(screen.getByText('Receipt #:')).toBeInTheDocument();
    expect(screen.getByText('123')).toBeInTheDocument();
  });

  it('should display the correct formatted date for a valid date string', () => {
    // Note: toLocaleDateString() output depends on locale. Usually MM/DD/YYYY or DD/MM/YYYY.
    // We can check if it contains the parts or just trust it renders *something* different than ISO string if valid.
    // Or we can mock the locale, but for now let's just check it renders a date.
    // A specific date like "2023-01-01" usually renders as "1/1/2023" or similar in US locale.

    // To make it robust across environments, we can check if it *doesn't* return "Invalid Date".
    // Or we can check if it formats to the expected locale string if we know the environment locale.
    // Let's assume the test environment uses a standard locale or we can just check if the date is present.

    const date = "2023-10-27";
    render(<ReceiptInvoiceInfo receiptId="123" date={date} isInvoice={true} />);
    const formattedDate = new Date(date).toLocaleDateString();
    expect(screen.getByText(formattedDate)).toBeInTheDocument();
  });

  it('should display the original date string if date is invalid', () => {
    const invalidDate = "invalid-date-string";
    render(<ReceiptInvoiceInfo receiptId="123" date={invalidDate} isInvoice={true} />);
    expect(screen.getByText(invalidDate)).toBeInTheDocument();
  });
});
