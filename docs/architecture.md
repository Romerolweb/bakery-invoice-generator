# Invoice Generator Application Architecture

This document outlines the architecture and design patterns used in the Baker's Invoice application.

## Overview

The application is built using Next.js with the App Router, React, TypeScript, and Shadcn UI components. It follows a modular approach, separating concerns into distinct layers: UI Components, Server Actions, Services, and Data Access.

## Core Principles

*   **Modularity:** Code is organized into logical units (components, actions, services, data access) to improve maintainability and testability.
*   **Separation of Concerns:** Each layer has a distinct responsibility, reducing coupling and making the codebase easier to understand and modify.
*   **Server Components by Default:** Leveraging Next.js Server Components reduces client-side JavaScript and improves initial load performance. Client components (`'use client'`) are used only when necessary for interactivity.
*   **Server Actions:** Used for form submissions and data mutations, simplifying data handling without needing separate API endpoints for many common tasks.
*   **Clear Data Flow:** Data flows primarily from UI components -> Server Actions -> Services (if needed) -> Data Access Layer -> Data Source (JSON files).
*   **Abstraction for External Services:** Services like PDF generation are abstracted behind interfaces, allowing for different implementations (e.g., PDFKit, Puppeteer) to be swapped with minimal changes to the core logic.

## Layers

```mermaid
graph TD
    subgraph "Browser (Client-Side)"
        A[UI Components (React + Shadcn)] -- Form Submission / Button Clicks --> B(Server Actions);
        A -- API Calls (PDF Status/Download) --> E[API Routes];
    end

    subgraph "Server-Side (Next.js)"
        B -- Calls --> C{Business Logic / Services};
        C -- Uses --> D[Data Access Layer];
        C -- Uses --> F[PDF Generation Service];
        E -- Uses --> D;
        F -- Writes PDF --> G[Data Storage];
        D -- Reads/Writes --> G;

    end

    subgraph "Data Storage"
        G[(JSON Files / PDF Files)];
    end

    %% Styling
    A -- Styles defined by --> H[Tailwind CSS / globals.css];
    B -- Calls --> I[Logging Service];
    C -- Calls --> I;
    D -- Calls --> I;
    E -- Calls --> I;
    F -- Calls --> I;

    classDef client fill:#f9f,stroke:#333,stroke-width:2px;
    classDef server fill:#ccf,stroke:#333,stroke-width:2px;
    classDef data fill:#cfc,stroke:#333,stroke-width:2px;
    classDef service fill:#fec,stroke:#333,stroke-width:1px;

    class A client;
    class B,C,D,E,F,I server;
    class G data;
    class H,I service;

```

1.  **UI Components (`src/app/**/page.tsx`, `src/components/ui`)**:
    *   Responsible for rendering the user interface using React and Shadcn UI components.
    *   Primarily client components (`'use client'`) as they handle user interactions (forms, buttons).
    *   Trigger Server Actions for data mutations (create, update, delete).
    *   Fetch data for display either directly via Server Components (if static) or by calling Server Actions/API routes from client components.
    *   Use hooks like `useState`, `useEffect`, `useForm` for managing component state and form handling.

2.  **Server Actions (`src/lib/actions/*.ts`)**:
    *   Server-side functions marked with `'use server'`.
    *   Handle business logic triggered by UI interactions (e.g., validating form data, calculating totals, preparing data for storage).
    *   Interact with the Data Access Layer to perform CRUD operations.
    *   Interact with Services (like PDF generation).
    *   Return results (success/failure status, data, error messages) back to the UI components.
    *   Implement data validation using Zod schemas.

3.  **Services (`src/lib/services/*.ts`)**:
    *   Encapsulate specific functionalities or interactions with external systems/libraries.
    *   **`PdfGeneratorInterface.ts`**: Defines the contract (`IPdfGenerator`) for any PDF generation strategy.
    *   **`pdfGenerator.ts` (PDFKit)**: Implements `IPdfGenerator` using the `pdfkit` library.
    *   **`puppeteerPdfGenerator.ts`**: Implements `IPdfGenerator` using the `puppeteer` library.
    *   **`logging.ts`**: Provides a centralized logging mechanism (`logger`) used across different layers to record information, warnings, and errors to the console and optionally to a file (`logs/app.log`).
    *   **`recordChanges.ts`**: A specific utility used internally by the development assistant to log file modifications made during development (`changes.log`).

4.  **Data Access Layer (`src/lib/data-access/*.ts`)**:
    *   Abstracts the details of data storage and retrieval.
    *   Provides functions like `getAllCustomers`, `createProduct`, `getReceiptById`, etc.
    *   Currently interacts directly with JSON files (`src/lib/data/*.json`) for simplicity. This layer could be modified to interact with a database without changing the Server Actions that use it.
    *   Handles reading from and writing to the JSON data files and the PDF storage directory (`src/lib/data/receipt-pdfs`).

5.  **Data Storage (`src/lib/data/*.json`, `src/lib/data/receipt-pdfs/`)**:
    *   Simple JSON files store customer, product, receipt, and seller profile data.
    *   Generated PDF files are stored in the `receipt-pdfs` subdirectory.

6.  **API Routes (`src/app/api/**/*.ts`)**:
    *   Used for specific client-server communication needs that don't fit the Server Action model well, such as:
        *   Downloading generated PDF files (`/api/download-pdf`).
        *   Checking the status of PDF generation (`/api/pdf-status`).

## PDF Generation Abstraction

The PDF generation logic is abstracted using the `IPdfGenerator` interface.

*   The `createReceipt` Server Action determines which generator implementation (`PdfGenerator` or `PuppeteerPdfGenerator`) to use based on the `PDF_GENERATOR` environment variable.
*   It instantiates the chosen generator and calls its `generate` method, passing the `Receipt` data.
*   Both generator implementations adhere to the `IPdfGenerator` interface, ensuring they accept the same input and return a `PdfGenerationResult`.
*   This allows swapping the PDF generation library by changing the environment variable and potentially adding new implementations without altering the `createReceipt` action significantly.

## Logging and Change Tracking

*   The **Logging Service** (`src/lib/services/logging.ts`) provides functions (`logger.info`, `logger.warn`, `logger.error`, `logger.debug`) used throughout the server-side code to record events. Logs are sent to the console and potentially to `logs/app.log` based on configuration. This aids in debugging and monitoring application behavior.
*   The **Change Recording Service** (`src/lib/recordChanges.ts`) is a developer-specific tool that logs code modifications to `changes.log`, helping to trace the evolution of the codebase during development.

## Data Flow Example (Creating an Invoice)

1.  User fills out the invoice form in the `NewInvoicePage` component (`src/app/page.tsx`).
2.  User clicks "Generate Invoice".
3.  The form's `onSubmit` handler in `NewInvoicePage` calls the `createReceipt` Server Action (`src/lib/actions/receipts.ts`) with the validated form data.
4.  `createReceipt` performs validation, fetches necessary data (products, seller, customer) via the Data Access Layer.
5.  `createReceipt` calculates totals and constructs the `Receipt` object.
6.  `createReceipt` calls `createReceiptData` in the Data Access Layer (`src/lib/data-access/receipts.ts`) to save the receipt JSON data.
7.  `createReceipt` determines the PDF generator type (e.g., PDFKit).
8.  `createReceipt` instantiates the chosen `IPdfGenerator` implementation (e.g., `PdfGenerator`).
9.  `createReceipt` calls the `generator.generate(receipt, operationId)` method.
10. The specific generator (`PdfGenerator` or `PuppeteerPdfGenerator`) creates the PDF content, interacts with the file system (via `fs`) to save the PDF to `src/lib/data/receipt-pdfs/`, and uses the `logger` for internal steps.
11. The `generate` method returns a `PdfGenerationResult` (success/failure, path, message).
12. `createReceipt` formats the result and returns it to the `NewInvoicePage`.
13. `NewInvoicePage` displays a success or error toast message to the user, potentially including a download button or error details.

This architecture aims for clarity, maintainability, and flexibility, particularly around the swappable PDF generation service.
