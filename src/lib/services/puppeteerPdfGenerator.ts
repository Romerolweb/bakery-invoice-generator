// src/lib/services/puppeteerPdfGenerator.ts
import puppeteer, { Browser, Page } from 'puppeteer';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { format, parseISO } from 'date-fns';
import { Receipt, LineItem, Customer, SellerProfile } from '@/lib/types';
import { IPdfGenerator, PdfGenerationResult } from './pdfGeneratorInterface';
import { logger } from '@/lib/services/logging';

const DATA_DIR = path.join(process.cwd(), 'src', 'lib', 'data');
const PDF_DIR = path.join(DATA_DIR, 'receipt-pdfs'); // Directory to store generated PDFs

export class PuppeteerPdfGenerator implements IPdfGenerator {
    private _logPrefix: string = '';
    private _filePath: string = '';
    private _operationId: string = '';

    // Ensure the PDF directory exists
    private async _ensurePdfDirectoryExists(): Promise<void> {
        const funcPrefix = `${this._logPrefix}:_ensurePdfDirectoryExists`;
        try {
            await fsPromises.mkdir(PDF_DIR, { recursive: true });
            await logger.debug(funcPrefix, `PDF directory ensured: ${PDF_DIR}`);
        } catch (error) {
            await logger.error(funcPrefix, 'FATAL: Error creating PDF directory', error);
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
                const dateObject = parseISO(dateString);
                if (isNaN(dateObject.getTime())) { throw new Error('Invalid date'); }
                return format(dateObject, 'dd/MM/yyyy');
            } catch (e) {
                logger.warn(funcPrefix, `Could not parse date: ${dateString}. Using original string.`, e);
                return dateString;
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

        // Simplified CSS relying on browser defaults more
        const css = `
            body {
                /* font-family: Arial, sans-serif; -- REMOVED to use browser default */
                font-size: 10pt; margin: 50px; color: #333; line-height: 1.4;
            }
            h1 { text-align: center; font-size: 16pt; margin-bottom: 30px; color: #111; font-weight: bold; }
            .info-section { display: flex; justify-content: space-between; margin-bottom: 25px; width: 100%; flex-wrap: wrap; } /* Added wrap */
            .info-block { width: 48%; margin-bottom: 10px; } /* Added bottom margin */
            .info-block h2 { font-size: 11pt; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 4px; color: #444; font-weight: bold;}
            .info-block p { margin: 3px 0; }
            .invoice-details { margin-bottom: 25px; text-align: right;}
            .invoice-details p { margin: 4px 0; font-size: 9pt; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; vertical-align: top; word-wrap: break-word; } /* Added word-wrap */
            th { background-color: #f8f8f8; font-weight: bold; }
            .text-right { text-align: right; }
            .text-center { text-align: center; }
            .totals { margin-top: 25px; float: right; width: 45%; }
            .totals table { width: 100%; }
            .totals td { border: none; padding: 4px 0; }
            .totals .label { text-align: right; padding-right: 10px; color: #555; }
            .totals .amount { text-align: right; }
            .totals .total-row td { font-weight: bold; border-top: 1px solid #aaa; padding-top: 8px; font-size: 11pt; }
            small { font-size: 8pt; color: #666; }
            .clear { clear: both; }
        `;

        return `
            <!DOCTYPE html>
            <html lang="en">
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
                        <tbody>
                            <tr>
                                <td class="label">Subtotal (ex GST):</td>
                                <td class="amount">${formatCurrency(receipt.subtotal_excl_GST)}</td>
                            </tr>
                            ${receipt.GST_amount > 0 ? `
                            <tr>
                                <td class="label">GST Amount (10%):</td>
                                <td class="amount">${formatCurrency(receipt.GST_amount)}</td>
                            </tr>
                            ` : ''}
                            <tr class="total-row">
                                <td class="label">Total Amount:</td>
                                <td class="amount">${formatCurrency(receipt.total_inc_GST)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                 <div class="clear"></div>
            </body>
            </html>
        `;
    }

    private async _cleanupFailedPdf(): Promise<void> {
        const funcPrefix = `${this._logPrefix}:_cleanupFailedPdf`;
        if (!this._filePath) {
             await logger.debug(funcPrefix, "Cleanup called without a file path.");
             return;
        }
        await logger.warn(funcPrefix, `Attempting cleanup for potentially failed Puppeteer PDF: ${this._filePath}`);
        try {
            await fsPromises.access(this._filePath);
            await logger.warn(funcPrefix, `Deleting incomplete/corrupted PDF: ${this._filePath}`);
            await fsPromises.unlink(this._filePath);
            await logger.info(funcPrefix, `Deleted incomplete PDF: ${this._filePath}`);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                await logger.info(funcPrefix, `Incomplete PDF ${this._filePath} did not exist, no need to delete.`);
            } else {
                await logger.error(funcPrefix, 'Error during PDF file cleanup', error);
            }
        } finally {
             this._filePath = ''; // Reset path to prevent repeated attempts
        }
    }

    public async generate(receipt: Receipt, operationId: string): Promise<PdfGenerationResult> {
        let browser: Browser | null = null;
        let page: Page | null = null;
        try {
            this._initialize(receipt.receipt_id, operationId);
            await this._ensurePdfDirectoryExists();

            const htmlContent = this._generateInvoiceHtml(receipt);

            await logger.debug(this._logPrefix, 'Launching Puppeteer browser...');
             browser = await puppeteer.launch({
                 headless: true,
                 args: [
                     '--no-sandbox',
                     '--disable-setuid-sandbox',
                     '--disable-dev-shm-usage',
                     '--disable-accelerated-2d-canvas',
                     '--no-first-run',
                     '--no-zygote',
                     '--disable-gpu'
                 ]
             });
            await logger.debug(this._logPrefix, 'Puppeteer browser launched.');

            page = await browser.newPage();
            await logger.debug(this._logPrefix, 'Puppeteer page created.');

            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            await logger.debug(this._logPrefix, 'HTML content set on page.');

            await page.pdf({
                path: this._filePath,
                format: 'A4',
                printBackground: true,
                margin: { top: '50px', right: '50px', bottom: '50px', left: '50px' },
            });
            await logger.info(this._logPrefix, 'PDF file generated successfully.');

            const finalFilePath = this._filePath;

             await page.close(); page = null; await logger.debug(this._logPrefix, 'Puppeteer page closed.');
             await browser.close(); browser = null; await logger.debug(this._logPrefix, 'Puppeteer browser closed.');

             this._filePath = ''; this._logPrefix = ''; this._operationId = ''; // Reset state

            return { success: true, filePath: finalFilePath };

        } catch (error: any) {
            await logger.error(this._logPrefix, 'ERROR during Puppeteer PDF generation orchestration', error);
            await this._cleanupFailedPdf();

            return { success: false, message: `Failed to generate PDF using Puppeteer: ${error.message || 'Unknown error'}` };
        } finally {
            if (page) {
                 try { await page.close(); await logger.debug(this._logPrefix, 'Puppeteer page closed in finally block.'); } catch (e) { await logger.warn(this._logPrefix, 'Error closing page in finally block', e); }
             }
            if (browser) {
                 try { await browser.close(); await logger.debug(this._logPrefix, 'Puppeteer browser closed in finally block.'); } catch (e) { await logger.warn(this._logPrefix, 'Error closing browser in finally block', e); }
            }
        }
    }
}
