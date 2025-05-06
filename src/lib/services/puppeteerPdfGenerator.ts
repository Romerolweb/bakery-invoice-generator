// src/lib/services/puppeteerPdfGenerator.ts
// REMOVED 'use server'; directive as it's not needed for a server-side utility and causes build errors when exporting a class.

import puppeteer, { Browser } from 'puppeteer';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { format, parseISO } from 'date-fns';
import { Receipt, LineItem, Customer, SellerProfile } from '@/lib/types';
import { logger } from '@/lib/services/logging';

const DATA_DIR = path.join(process.cwd(), 'src', 'lib', 'data');
const PDF_DIR = path.join(DATA_DIR, 'receipt-pdfs'); // Directory to store generated PDFs

// Result structure for the PDF generation process
interface PdfGenerationResult {
    success: boolean;
    message?: string;
    filePath?: string;
}

export class PuppeteerPdfGenerator {
    private _logPrefix: string = '';
    private _filePath: string = '';
    private _operationId: string = '';

    // Ensure the PDF directory exists
    private async _ensurePdfDirectoryExists(): Promise<void> {
        const funcPrefix = `${this._logPrefix}:_ensurePdfDirectoryExists`;
        try {
            await fsPromises.mkdir(PDF_DIR, { recursive: true });
            logger.debug(funcPrefix, `PDF directory ensured: ${PDF_DIR}`);
        } catch (error) {
            logger.error(funcPrefix, 'FATAL: Error creating PDF directory', error);
            throw new Error(`Failed to ensure PDF directory exists: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private _initialize(receiptId: string, operationId: string): void {
        this._operationId = operationId;
        this._logPrefix = `[${operationId} PuppeteerPDF ${receiptId}]`;
        this._filePath = path.join(PDF_DIR, `${receiptId}.pdf`);
        logger.info(this._logPrefix, `Initializing Puppeteer PDF generation for path: ${this._filePath}`);
    }

    // Generates the HTML content for the invoice
    private _generateInvoiceHtml(receipt: Receipt): string {
        const funcPrefix = `${this._logPrefix}:_generateInvoiceHtml`;
        logger.debug(funcPrefix, 'Generating HTML content for invoice.');

        const formatDate = (dateString: string): string => {
            try {
                return format(parseISO(dateString), 'dd/MM/yyyy');
            } catch (e) {
                logger.warn(funcPrefix, `Could not parse date: ${dateString}`, e);
                return dateString; // Fallback
            }
        };

        const formatCurrency = (amount: number): string => `$${amount.toFixed(2)}`;

        const seller = receipt.seller_profile_snapshot;
        const customer = receipt.customer_snapshot;

        const lineItemsHtml = receipt.line_items.map(item => `
            <tr>
                <td>${item.product_name || 'N/A'} ${item.description ? `<br/><small>(${item.description})</small>` : ''}</td>
                ${receipt.GST_amount > 0 ? `<td class="text-center">${item.GST_applicable ? 'Yes' : 'No'}</td>` : ''}
                <td class="text-right">${item.quantity}</td>
                <td class="text-right">${formatCurrency(item.unit_price)}</td>
                <td class="text-right">${formatCurrency(item.line_total)}</td>
            </tr>
        `).join('');

        // Basic CSS for styling
        const css = `
            body { font-family: Arial, sans-serif; font-size: 10pt; margin: 50px; }
            h1 { text-align: center; font-size: 16pt; margin-bottom: 20px; }
            .info-section { display: flex; justify-content: space-between; margin-bottom: 20px; }
            .info-block { width: 48%; }
            .info-block h2 { font-size: 11pt; margin-bottom: 5px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
            .invoice-details { margin-bottom: 20px; text-align: right;}
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .totals { margin-top: 20px; float: right; width: 40%; }
            .totals table { width: 100%; }
            .totals td { border: none; padding: 3px 0; }
            .totals .total-row td { font-weight: bold; border-top: 1px solid #aaa; padding-top: 5px; }
            small { font-size: 8pt; color: #555; }
            .clear { clear: both; }
        `;

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Invoice ${receipt.receipt_id}</title>
                <style>${css}</style>
            </head>
            <body>
                <h1>${receipt.is_tax_invoice ? 'TAX INVOICE' : 'INVOICE'}</h1>

                <div class="info-section">
                    <div class="info-block">
                        <h2>From:</h2>
                        <p><strong>${seller.name || 'N/A'}</strong></p>
                        <p>${seller.business_address || 'N/A'}</p>
                        <p>ABN/ACN: ${seller.ABN_or_ACN || 'N/A'}</p>
                        <p>Email: ${seller.contact_email || 'N/A'}</p>
                        ${seller.phone ? `<p>Phone: ${seller.phone}</p>` : ''}
                    </div>
                    <div class="info-block">
                        <h2>To:</h2>
                        ${customer.customer_type === 'business' ? `
                            <p><strong>${customer.business_name || 'N/A'}</strong></p>
                            ${customer.abn ? `<p>ABN: ${customer.abn}</p>` : ''}
                            ${(customer.first_name || customer.last_name) ? `<p>Contact: ${customer.first_name || ''} ${customer.last_name || ''}</p>` : ''}
                        ` : `
                            <p><strong>${customer.first_name || ''} ${customer.last_name || ''}</strong></p>
                        `}
                        <p>Email: ${customer.email || 'N/A'}</p>
                        <p>Phone: ${customer.phone || 'N/A'}</p>
                        <p>Address: ${customer.address || 'N/A'}</p>
                    </div>
                </div>

                 <div class="invoice-details">
                     <p><strong>Invoice ID:</strong> ${receipt.receipt_id}</p>
                     <p><strong>Date:</strong> ${formatDate(receipt.date_of_purchase)}</p>
                 </div>

                <table>
                    <thead>
                        <tr>
                            <th>Item</th>
                            ${receipt.GST_amount > 0 ? '<th class="text-center">GST?</th>' : ''}
                            <th class="text-right">Qty</th>
                            <th class="text-right">Unit Price</th>
                            <th class="text-right">Line Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${lineItemsHtml}
                    </tbody>
                </table>

                <div class="totals">
                    <table>
                        <tr>
                            <td>Subtotal (ex GST):</td>
                            <td class="text-right">${formatCurrency(receipt.subtotal_excl_GST)}</td>
                        </tr>
                        ${receipt.GST_amount > 0 ? `
                        <tr>
                            <td>GST Amount (10%):</td>
                            <td class="text-right">${formatCurrency(receipt.GST_amount)}</td>
                        </tr>
                        ` : ''}
                        <tr class="total-row">
                            <td>Total Amount:</td>
                            <td class="text-right">${formatCurrency(receipt.total_inc_GST)}</td>
                        </tr>
                    </table>
                </div>
                 <div class="clear"></div>
            </body>
            </html>
        `;
    }

    // Main generation method
    public async generate(receipt: Receipt, operationId: string): Promise<PdfGenerationResult> {
        let browser: Browser | null = null;
        try {
            this._initialize(receipt.receipt_id, operationId);
            await this._ensurePdfDirectoryExists();

            const htmlContent = this._generateInvoiceHtml(receipt);

            logger.debug(this._logPrefix, 'Launching Puppeteer browser...');
            // Launch puppeteer - consider args for production/docker environments
             browser = await puppeteer.launch({
                 headless: true, // Use the new headless mode
                 args: [
                     '--no-sandbox', // Often required in containerized environments
                     '--disable-setuid-sandbox',
                     '--disable-dev-shm-usage', // Overcomes limited resource problems
                     '--disable-accelerated-2d-canvas',
                     '--no-first-run',
                     '--no-zygote',
                    // '--single-process', // Disables GPU process - try if GPU issues arise
                     '--disable-gpu' // Fully disable GPU
                 ]
             });
            logger.debug(this._logPrefix, 'Puppeteer browser launched.');

            const page = await browser.newPage();
            logger.debug(this._logPrefix, 'Puppeteer page created.');

            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            logger.debug(this._logPrefix, 'HTML content set on page.');

            await page.pdf({
                path: this._filePath,
                format: 'A4',
                printBackground: true, // Ensure styles are applied
                margin: { top: '50px', right: '50px', bottom: '50px', left: '50px' },
            });
            logger.info(this._logPrefix, 'PDF file generated successfully.');

            return { success: true, filePath: this._filePath };

        } catch (error: any) {
            logger.error(this._logPrefix, 'ERROR during Puppeteer PDF generation', error);
             // Attempt to delete partial file if it exists
             try {
                 await fsPromises.access(this._filePath);
                 logger.warn(this._logPrefix, `Attempting to delete potentially incomplete PDF: ${this._filePath}`);
                 await fsPromises.unlink(this._filePath);
                 logger.info(this._logPrefix, `Deleted incomplete PDF: ${this._filePath}`);
             } catch (cleanupError: any) {
                 if (cleanupError.code !== 'ENOENT') {
                    logger.error(this._logPrefix, 'Error during PDF cleanup', cleanupError);
                 } else {
                     logger.info(this._logPrefix, 'Incomplete PDF did not exist, no cleanup needed.');
                 }
             }
            return { success: false, message: `Failed to generate PDF using Puppeteer: ${error.message || 'Unknown error'}` };
        } finally {
            if (browser) {
                 try {
                    await browser.close();
                    logger.debug(this._logPrefix, 'Puppeteer browser closed.');
                } catch (closeError) {
                    logger.error(this._logPrefix, 'Error closing Puppeteer browser', closeError);
                }
            }
            // Reset internal state
            this._filePath = '';
            this._logPrefix = '';
        }
    }
}

// Factory function to create an instance (optional, but can be useful)
// Exporting as an async function to comply with 'use server' rules if this file were to be marked as such.
// Although the directive is removed, keeping it async doesn't hurt and maintains flexibility.
export async function createPuppeteerPdfGenerator(): Promise<PuppeteerPdfGenerator> {
    return new PuppeteerPdfGenerator();
}
