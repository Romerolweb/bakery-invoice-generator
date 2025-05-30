// src/lib/services/pdfGenerator.ts
import type { Receipt } from "@/lib/types"; // Removed LineItem, Customer, SellerProfile as they are used by template
import { IPdfGenerator, PdfGenerationResult } from "./pdfGeneratorInterface";
import { IPdfReceiptTemplate, PdfReceiptTemplateConstructor } from "./pdfTemplates/IPdfReceiptTemplate"; // Import the template interface AND constructor type
import {
  promises as fsPromises,
  createWriteStream,
  WriteStream,
  accessSync,
  unlinkSync,
} from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { logger } from "@/lib/services/logging"; // Removed format and parseISO as they are used by template
import * as pdfStyles from "./pdfStyles"; // Import styles

const DATA_DIR = path.join(process.cwd(), "src", "lib", "data");
const PDF_DIR = path.join(DATA_DIR, "receipt-pdfs"); // Directory to store generated PDFs

export class PdfGenerator implements IPdfGenerator {
  private _doc: PDFKit.PDFDocument | null = null;
  private _stream: WriteStream | null = null;
  private _filePath: string = "";
  private _logPrefix: string = "";
  private _success: boolean = false;
  private _operationId: string = ""; // To correlate logs
  private _template: IPdfReceiptTemplate; // Store the template instance

  // Constructor updated to accept a template constructor
  constructor(TemplateClass: PdfReceiptTemplateConstructor) {
    this._template = new TemplateClass(); // Instantiate the template
  }

  // Ensure the PDF directory exists
  private async _ensurePdfDirectoryExists(): Promise<void> {
    const funcPrefix = `${this._logPrefix}:_ensurePdfDirectoryExists`;
    try {
      await fsPromises.mkdir(PDF_DIR, { recursive: true });
      await logger.debug(funcPrefix, `PDF directory ensured: ${PDF_DIR}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error : new Error(String(error));
      await logger.error(
        funcPrefix,
        "FATAL: Error creating PDF directory",
        errorMessage,
      );
      throw new Error(
        `Failed to ensure PDF directory exists: ${errorMessage.message}`,
      );
    }
  }

  private _initialize(receiptId: string, operationId: string): void {
    this._operationId = operationId;
    this._logPrefix = `[${operationId} PDFKit ${receiptId}]`; // Indicate PDFKit
    this._filePath = path.join(PDF_DIR, `${receiptId}.pdf`);
    logger.info(
      this._logPrefix,
      `Initializing PDF generation for path: ${this._filePath}`
    );
    try {
      this._doc = new PDFDocument({
        margin: pdfStyles.PAGE_MARGIN,
        bufferPages: true,
        font: pdfStyles.FONT_REGULAR,
      });
      // Pass the document and logPrefix to the template
      this._template.setDocument(this._doc);
      this._template.setLogPrefix(this._logPrefix);
      logger.debug(this._logPrefix, `PDFDocument instantiated successfully and passed to template.`);
    } catch (instantiationError) {
      const errorMessage = instantiationError instanceof Error ? instantiationError : new Error(String(instantiationError));
      logger.error(
        this._logPrefix,
        `FATAL: Error instantiating PDFDocument`,
        errorMessage,
      );
      throw new Error(
        `PDF library initialization error: ${errorMessage.message}`,
      );
    }
    this._success = false; // Reset success flag
  }

  private async _setupStream(): Promise<void> {
    const funcPrefix = `${this._logPrefix}:_setupStream`;
    return new Promise(async (resolve, reject) => {
      try {
        await this._ensurePdfDirectoryExists(); // Ensure directory exists right before creating the stream
        await logger.debug(
          funcPrefix,
          `Creating write stream for ${this._filePath}`
        );
        this._stream = createWriteStream(this._filePath);

        this._stream.on("finish", () => {
          logger.info(funcPrefix, "PDF stream finished.");
          this._success = true; // Mark success on finish
          resolve();
        });

        this._stream.on("error", (err) => {
          logger.error(funcPrefix, "PDF stream error", err);
          this._success = false;
          reject(new Error(`PDF stream error: ${err.message}`));
        });

        if (!this._doc) {
          // This check is crucial. If _doc is null, template.setDocument would have failed or not been called.
          const docErrorMsg = "PDF Document not initialized before setting up stream or passed to template.";
          logger.error(funcPrefix, docErrorMsg);
          reject(new Error(docErrorMsg));
          return;
        }
        
        // It's already confirmed _doc is not null, so this._template.setDocument(this._doc) in _initialize was called.
        // The template now holds the reference to this._doc.

        this._doc.on("error", (err) => {
          logger.error(funcPrefix, "PDF document error during piping", err);
          this._success = false;
          reject(new Error(`PDF document error: ${err.message}`));
        });

        await logger.debug(funcPrefix, "Piping PDF document to stream...");
        this._doc.pipe(this._stream);
      } catch (setupError) {
        const errorMessage = setupError instanceof Error ? setupError : new Error(String(setupError));
        await logger.error(
          funcPrefix,
          "Error setting up PDF stream or piping",
          errorMessage,
        );
        reject(errorMessage); // Reject the promise on setup error
      }
    });
  }

  private async _finalize(): Promise<void> {
    const funcPrefix = `${this._logPrefix}:_finalize`;
    return new Promise((resolve, reject) => {
      if (!this._doc || !this._stream) {
        const errorMsg = !this._doc
          ? "Document not initialized."
          : "Stream not initialized.";
        logger.error(funcPrefix, `Finalize called prematurely. ${errorMsg}`);
        return reject(new Error(errorMsg));
      }

      const streamFinishPromise = new Promise<void>((res, rej) => {
        this._stream!.once("finish", res);
        this._stream!.once("error", rej); // Stream errors reject
        this._doc!.once("error", rej);    // Document errors also reject
      });

      logger.info(funcPrefix, "Finalizing PDF document (calling end())...");
      this._doc.end();

      streamFinishPromise
        .then(() => {
          logger.info(
            funcPrefix,
            "Stream finished successfully during finalize.",
          );
          this._success = true;
          resolve();
        })
        .catch((err) => {
          const errorMessage = err instanceof Error ? err : new Error(String(err));
          logger.error(
            funcPrefix,
            "Stream or document error during finalize",
            errorMessage,
          );
          this._success = false;
          reject(errorMessage);
        });
    });
  }

  private async _cleanupFailedPdf(): Promise<void> {
    const funcPrefix = `${this._logPrefix}:_cleanupFailedPdf`;
    if (!this._filePath) {
      await logger.debug(
        funcPrefix,
        "Cleanup called without a file path, likely initialization failed early.",
      );
      return;
    }
    await logger.warn(funcPrefix, `Attempting cleanup for: ${this._filePath}`);
    try {
      if (this._stream && !this._stream.closed && this._stream.writable) {
        await logger.debug(
          funcPrefix,
          "Closing potentially open write stream...",
        );
        await new Promise<void>((resolve, reject) => { // Added reject for clarity
          this._stream!.once("close", resolve);
          this._stream!.once("error", (err) => {
            logger.error(
              funcPrefix,
              "Error closing stream during cleanup",
              err, // Pass the actual error
            );
            resolve(); // Still resolve as cleanup should try to continue
          });
          this._stream!.end();
        });
        await logger.debug(
          funcPrefix,
          "Finished waiting for stream close/error.",
        );
      } else {
        await logger.debug(
          funcPrefix,
          "No active/writable stream to close or already closed.",
        );
      }

      await logger.debug(
        funcPrefix,
        `Checking existence of potentially incomplete PDF: ${this._filePath}`,
      );
      try {
        accessSync(this._filePath);
        await logger.warn(
          funcPrefix,
          `Attempting to delete incomplete/corrupted PDF: ${this._filePath}`,
        );
        unlinkSync(this._filePath);
        await logger.info(
          funcPrefix,
          `Deleted incomplete/corrupted PDF: ${this._filePath}`,
        );
      } catch (accessOrUnlinkError: any) {
        if (accessOrUnlinkError.code === "ENOENT") {
          await logger.info(
            funcPrefix,
            `Incomplete PDF ${this._filePath} did not exist, no need to delete.`,
          );
        } else {
          const errorMessage = accessOrUnlinkError instanceof Error ? accessOrUnlinkError : new Error(String(accessOrUnlinkError));
          await logger.error(
            funcPrefix,
            "Error accessing or deleting potentially corrupted PDF during cleanup",
            errorMessage,
          );
        }
      }
    } catch (cleanupError) {
      const errorMessage = cleanupError instanceof Error ? cleanupError : new Error(String(cleanupError));
      await logger.error(
        funcPrefix,
        "Error during PDF cleanup process itself",
        errorMessage,
      );
    } finally {
      this._doc = null;
      this._stream = null;
    }
  }

  public async generate(
    receipt: Receipt,
    operationId: string,
  ): Promise<PdfGenerationResult> {
    try {
      this._initialize(receipt.receipt_id, operationId); // _doc is created and passed to template here
    } catch (initError: any) { // Keep any for broad initial catch
      const errorToLog = initError instanceof Error ? initError : new Error(String(initError));
      await logger.error(
        this._logPrefix || // Fallback log prefix
          `[${operationId} PDFKit ${receipt?.receipt_id || "unknown"}]`,
        "ERROR during PDF initialization",
        errorToLog,
      );
      return {
        success: false,
        message: errorToLog.message || "PDF initialization failed.",
      };
    }

    try {
      await this._setupStream();

      // --- Add Content using the template ---
      await logger.debug(this._logPrefix, "Adding content to PDF via template...");
      
      // Ensure _doc is available for the template. It was set in _initialize.
      if (!this._doc) {
        throw new Error("PDF Document not available for template processing.");
      }
      // this._template.setDocument(this._doc); // Already set in _initialize
      // this._template.setLogPrefix(this._logPrefix); // Already set in _initialize

      this._template.addHeader(receipt.is_tax_invoice);
      this._template.addSellerInfo(receipt.seller_profile_snapshot);
      this._template.addCustomerInfo(receipt.customer_snapshot);
      // If addInvoiceDetails is not part of the interface, remove or replace with the correct method if needed.
      // this._template.addInvoiceDetails(receipt.receipt_id, receipt.date_of_purchase);

      this._template.addItemsTable(receipt.line_items, receipt.GST_amount > 0);
      this._template.addTotals(
        receipt.subtotal_excl_GST,
        receipt.GST_amount,
        receipt.total_inc_GST,
        receipt.GST_amount > 0 // Pass includeGST as the fourth argument
      );

      // --- Finalize Document ---
      await this._finalize();

      await logger.info(
        this._logPrefix,
        `PDF generation process completed. Success flag: ${this._success}`,
      );
      if (!this._success) {
        throw new Error(
          "PDF generation failed: Finalize completed but success flag is false.",
        );
      }
      await logger.info(this._logPrefix, "PDF generation successful.");
      const finalFilePath = this._filePath;
      this._doc = null;
      this._stream = null;
      this._filePath = "";
      return { success: true, filePath: finalFilePath };
    } catch (error: any) { // Keep any for broad catch during generation
      const errorToLog = error instanceof Error ? error : new Error(String(error));
      await logger.error(
        this._logPrefix,
        "ERROR during PDF generation orchestration",
        errorToLog,
      );
      await this._cleanupFailedPdf();

      return { success: false, message: errorToLog.message || "Unknown error during PDF generation" };
    }
  }
}
