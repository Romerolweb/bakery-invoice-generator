import { formatDate, escapeHTML } from "@/lib/utils";
import { Receipt, LineItem, SellerProfile, Customer } from "@/lib/types";

// Helper function to generate basic HTML for the receipt
export function generateReceiptHTML(receipt: Receipt): string {
  const seller: SellerProfile = receipt.seller_profile_snapshot;
  const customer: Customer = receipt.customer_snapshot;

  let lineItemsHTML = "";
  receipt.line_items.forEach((item: LineItem) => {
    lineItemsHTML += `
      <tr>
        <td>${escapeHTML(item.product_name)}</td>
        <td>${item.quantity}</td>
        <td>$${item.unit_price.toFixed(2)}</td>
        <td>$${item.line_total.toFixed(2)}</td>
      </tr>
    `;
  });

  const rawCustomerName = customer.customer_type === 'business'
    ? (customer.business_name ?? '')
    : `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim();
  const customerName = escapeHTML(rawCustomerName);

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Receipt ${escapeHTML(receipt.receipt_id.slice(0,8))}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          background-color: #fff;
          color: #333;
        }
        .receipt-container {
          max-width: 800px;
          margin: auto;
          padding: 20px;
          border: 1px solid #eee;
        }
        h1, h2, h3 {
          margin-top: 0;
          color: #333;
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
        }
        .header h1 {
          font-size: 2em;
          margin-bottom: 0;
        }
        .header p {
          font-size: 0.9em;
          color: #777;
        }
        .info-section {
          display: flex;
          justify-content: space-between;
          margin-bottom: 20px;
          padding-bottom: 20px;
          border-bottom: 1px solid #eee;
        }
        .info-section div {
          width: 48%;
        }
        .info-section h3 {
          font-size: 1.1em;
          margin-bottom: 5px;
          border-bottom: 1px solid #eee;
          padding-bottom: 5px;
        }
        .info-section p, .info-section address {
          font-size: 0.9em;
          line-height: 1.6;
          margin: 0;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        th, td {
          border: 1px solid #eee;
          padding: 10px;
          text-align: left;
        }
        th {
          background-color: #f9f9f9;
          font-weight: bold;
        }
        .totals-section {
          margin-top: 20px;
          text-align: right;
        }
        .totals-section p {
          font-size: 1em;
          margin: 5px 0;
        }
        .totals-section p strong {
          display: inline-block;
          width: 150px; /* Adjust as needed */
        }
        .footer {
          text-align: center;
          margin-top: 30px;
          font-size: 0.8em;
          color: #777;
        }
        @media print {
          body {
            margin: 0;
            padding: 0;
            background-color: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .receipt-container {
            border: none;
            box-shadow: none;
            margin: 0;
            max-width: 100%;
            padding: 0;
          }
          .no-print {
            display: none;
          }
        }
      </style>
    </head>
    <body>
      <div class="receipt-container">
        <div class="header">
          <h1>${receipt.is_tax_invoice ? 'Tax Invoice' : 'Receipt'}</h1>
          <p>${escapeHTML(seller.name)}</p>
        </div>

        <div class="info-section">
          <div>
            <h3>Seller Information</h3>
            <address>
              <strong>${escapeHTML(seller.name)}</strong><br>
              ${escapeHTML(seller.business_address).replace(/\n/g, '<br>')}<br>
              Email: ${escapeHTML(seller.contact_email)}<br>
              ${seller.phone ? `Phone: ${escapeHTML(seller.phone)}<br>` : ''}
              ABN: ${escapeHTML(seller.ABN_or_ACN)}
            </address>
          </div>
          <div>
            <h3>Bill To</h3>
            <address>
              <strong>${customerName}</strong><br>
              ${customer.address ? `${escapeHTML(customer.address).replace(/\n/g, '<br>')}<br>` : ''}
              ${customer.email ? `Email: ${escapeHTML(customer.email)}<br>` : ''}
              ${customer.phone ? `Phone: ${escapeHTML(customer.phone)}<br>` : ''}
              ${customer.abn ? `ABN: ${escapeHTML(customer.abn)}` : ''}
            </address>
          </div>
        </div>

        <div class="info-section">
            <div>
                <p><strong>Receipt #:</strong> ${escapeHTML(receipt.receipt_id.slice(0,12))}...</p>
            </div>
            <div>
                <p><strong>Date:</strong> ${formatDate(receipt.date_of_purchase)}</p>
            </div>
        </div>

        <h3>Items</h3>
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            ${lineItemsHTML}
          </tbody>
        </table>

        <div class="totals-section">
          <p><strong>Subtotal (excl. GST):</strong> $${receipt.subtotal_excl_GST.toFixed(2)}</p>
          <p><strong>GST:</strong> $${receipt.GST_amount.toFixed(2)}</p>
          <p><strong>Total (inc. GST):</strong> $${receipt.total_inc_GST.toFixed(2)}</p>
        </div>

        <div class="footer">
          <p>Thank you for your business!</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
