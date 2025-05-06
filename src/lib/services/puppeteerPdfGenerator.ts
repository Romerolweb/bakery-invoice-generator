// src/lib/services/puppeteerPdfGenerator.ts
import puppeteer, { Browser, Page } from 'puppeteer';
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
    private logPrefix: string = '';
    private filePath: string = '';
    private operationId: string = '';

    // Ensure the PDF directory exists
    private async ensurePdfDirectoryExists(): Promise<void> {
        const funcPrefix = `${this.logPrefix}:ensurePdfDirectoryExists`;
        try {
            await fsPromises.mkdir(PDF_DIR, { recursive: true });
            logger.debug(funcPrefix, `PDF directory ensured: ${PDF_DIR}`);
        } catch (error) {
            logger.error(funcPrefix, 'FATAL: Error creating PDF directory', error);
            throw new Error(`Failed to ensure PDF directory exists: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private initialize(receiptId: string, operationId: string): void {
        this.operationId = operationId;
        this.logPrefix = `[${operationId} PuppeteerPDF ${receiptId}]`;
        this.filePath = path.join(PDF_DIR, `${receiptId}.pdf`);
        logger.info(this.logPrefix, `Initializing Puppeteer PDF generation for path: ${this.filePath}`);
    }

    // Generates the HTML content for the invoice
    private generateInvoiceHtml(receipt: Receipt): string {
        const funcPrefix = `${this.logPrefix}:generateInvoiceHtml`;
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

    private async cleanupFailedPdf(): Promise<void> {
        const funcPrefix = `${this.logPrefix}:cleanupFailedPdf`;
        if (!this.filePath) {
             logger.debug(funcPrefix, "Cleanup called without a file path.");
             return;
        }
        logger.warn(funcPrefix, `Attempting cleanup for potentially failed Puppeteer PDF: ${this.filePath}`);
        try {
            await fsPromises.access(this.filePath);
            logger.warn(funcPrefix, `Deleting incomplete/corrupted PDF: ${this.filePath}`);
            await fsPromises.unlink(this.filePath);
            logger.info(funcPrefix, `Deleted incomplete PDF: ${this.filePath}`);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                logger.info(funcPrefix, `Incomplete PDF ${this.filePath} did not exist, no need to delete.`);
            } else {
                logger.error(funcPrefix, 'Error during PDF file cleanup', error);
            }
        } finally {
             this.filePath = ''; // Reset path to prevent repeated attempts
        }
    }

    public async generate(receipt: Receipt, operationId: string): Promise<PdfGenerationResult> {
        let browser: Browser | null = null;
        let page: Page | null = null;
        try {
            this.initialize(receipt.receipt_id, operationId);
            await this.ensurePdfDirectoryExists();

            const htmlContent = this.generateInvoiceHtml(receipt);

            logger.debug(this.logPrefix, 'Launching Puppeteer browser...');
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
            logger.debug(this.logPrefix, 'Puppeteer browser launched.');

            page = await browser.newPage();
            logger.debug(this.logPrefix, 'Puppeteer page created.');

            await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
            logger.debug(this.logPrefix, 'HTML content set on page.');

            await page.pdf({
                path: this.filePath,
                format: 'A4',
                printBackground: true,
                margin: { top: '50px', right: '50px', bottom: '50px', left: '50px' },
            });
            logger.info(this.logPrefix, 'PDF file generated successfully.');

            const finalFilePath = this.filePath;

             await page.close(); page = null; logger.debug(this.logPrefix, 'Puppeteer page closed.');
             await browser.close(); browser = null; logger.debug(this.logPrefix, 'Puppeteer browser closed.');

             this.filePath = ''; this.logPrefix = ''; this.operationId = ''; // Reset state

            return { success: true, filePath: finalFilePath };

        } catch (error: any) {
            logger.error(this.logPrefix, 'ERROR during Puppeteer PDF generation orchestration', error);
            await this.cleanupFailedPdf();

            return { success: false, message: `Failed to generate PDF using Puppeteer: ${error.message || 'Unknown error'}` };
        } finally {
            if (page) {
                 try { await page.close(); logger.debug(this.logPrefix, 'Puppeteer page closed in finally block.'); } catch (e) { logger.warn(this.logPrefix, 'Error closing page in finally block', e); }
             }
            if (browser) {
                 try { await browser.close(); logger.debug(this.logPrefix, 'Puppeteer browser closed in finally block.'); } catch (e) { logger.warn(this.logPrefix, 'Error closing browser in finally block', e); }
            }
        }
    }
}

// Factory function to create an instance (optional, but can be useful)
export async function createPuppeteerPdfGenerator(): Promise<PuppeteerPdfGenerator> {
    return new PuppeteerPdfGenerator();
}
