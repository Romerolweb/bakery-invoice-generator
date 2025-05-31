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
*   **Web-Based Receipt Viewing:** Receipt display and printing capabilities are implemented through web components that render receipts for browser viewing and printing.

## Layers

```mermaid
graph TD
    subgraph "Browser (Client-Side)"
        A[UI Components (React + Shadcn)] -- Form Submission / Button Clicks --> B(Server Actions);
        A -- Receipt Viewing --> E[API Routes];
    end

    subgraph "Server-Side (Next.js)"
        B -- Calls --> C{Business Logic / Services};
        C -- Uses --> D[Data Access Layer];
        E -- Uses --> D;
        D -- Reads/Writes --> G[Data Storage];
    end

    subgraph "Data Storage"
        G[(JSON Files)];
    end

    %% Styling
    A -- Styles defined by --> H[Tailwind CSS / globals.css];
    B -- Calls --> I[Logging Service];
    C -- Calls --> I;
    D -- Calls --> I;
    E -- Calls --> I;

    classDef client fill:#f9f,stroke:#333,stroke-width:2px;
    classDef server fill:#ccf,stroke:#333,stroke-width:2px;
    classDef data fill:#cfc,stroke:#333,stroke-width:2px;
    classDef service fill:#fec,stroke:#333,stroke-width:1px;

    class A client;
    class B,C,D,E,I server;
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
    *   Return results (success/failure status, data, error messages) back to the UI components.
    *   Implement data validation using Zod schemas.

3.  **Services (`src/lib/services/*.ts`)**:
    *   Encapsulate specific functionalities or interactions with external systems/libraries.
    *   **`logging.ts`**: Provides a centralized logging mechanism (`logger`) used across different layers to record information, warnings, and errors to the console and optionally to a file (`logs/app.log`).

4.  **Data Access Layer (`src/lib/data-access/*.ts`)**:
    *   Abstracts the details of data storage and retrieval.
    *   Provides functions like `getAllCustomers`, `createProduct`, `getReceiptById`, etc.
    *   Currently interacts directly with JSON files (`src/lib/data/*.json`) for simplicity. This layer could be modified to interact with a database without changing the Server Actions that use it.
    *   Handles reading from and writing to the JSON data files.

5.  **Data Storage (`src/lib/data/*.json`)**:
    *   Simple JSON files store customer, product, receipt, and seller profile data.

6.  **API Routes (`src/app/api/**/*.ts`)**:
    *   Used for specific client-server communication needs that don't fit the Server Action model well, such as:
        *   Fetching receipt data for viewing (`/api/receipts/[id]`).

## Web-Based Receipt System

The application uses a web-based receipt viewing system instead of PDF generation.

*   The `createReceipt` Server Action saves receipt data to the JSON data store.
*   Receipts are viewed through the web interface at `/receipt/[id]` using the `ReceiptWebView` component.
*   The receipt data is fetched via API routes and rendered as HTML/CSS for viewing and printing.
*   Users can print receipts directly from the browser using the built-in print functionality.

### Receipt Viewing Components
The web-based receipt system consists of several key components:
*   **ReceiptWebView**: Main container component that fetches receipt data and manages loading states.
*   **ReceiptContent**: Renders the complete receipt layout with all sections.
*   **PrintToolbar**: Provides print functionality with print-optimized styling.
*   **Receipt Section Components**: Modular components for different receipt sections (header, seller info, customer info, items table, totals, footer).

### Advantages of Web-Based Receipts
*   **No System Dependencies**: No need for PDF generation libraries or browser dependencies.
*   **Responsive Design**: Receipts automatically adapt to different screen sizes.
*   **Print Optimization**: CSS print styles ensure proper formatting when printing.
*   **Instant Viewing**: No generation delays - receipts are available immediately.
*   **Accessibility**: Better screen reader support and keyboard navigation.
*   **Easy Styling**: Receipt appearance can be easily customized with CSS.

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
7.  `createReceipt` returns a success result with the receipt ID.
8.  `NewInvoicePage` displays a success message and provides a "View Receipt" button.
9.  When the user clicks "View Receipt", they are navigated to `/receipt/[id]`.
10. The `ReceiptWebView` component fetches the receipt data via the API route (`/api/receipts/[id]`).
11. The receipt data is rendered using the `ReceiptContent` component with all receipt sections.
12. Users can view the receipt on screen or print it using the browser's print function.

This architecture aims for clarity, maintainability, and flexibility, particularly around the web-based receipt viewing system.
